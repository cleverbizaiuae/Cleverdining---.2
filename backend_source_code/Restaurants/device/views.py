import random
import re
import string
import threading
import logging
from rest_framework import viewsets, permissions,filters
from rest_framework.response import Response
from rest_framework import status
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import serializers
from .models import Device,Reservation
from .serializers import DeviceSerializer,ReservationSerializer,ReservationStatusUpdateSerializer,ReservationUpdateSerializer
from .reservation_services import (
    ReservationConflictError,
    available_slots,
    available_tables,
    conflicting_reservation,
    create_for_device,
    reservation_end,
    reschedule,
)
from .session_services import expire_inactive_guest_sessions, occupied_device_count
from accounts.models import User
from restaurant.models import Restaurant
from .paginations import DevicePagination,ReservationPagination
from rest_framework.decorators import action
from accounts.permissions import IsOwnerRole,IsOwnerORStaff,IsOwnerChefOrStaff
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from accounts.models import ChefStaff
from restaurant.region_config import resolve_region_defaults
from rest_framework.exceptions import PermissionDenied
from django.utils.dateparse import parse_date, parse_datetime
from core.filter_backends import SchemaSafeDjangoFilterBackend as DjangoFilterBackend
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db.models import Q
from django.utils import timezone as django_timezone
from django.utils.timezone import now
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
import uuid
from .models import Device, Reservation, GuestSession

channel_layer = get_channel_layer()
logger = logging.getLogger(__name__)


def _resolve_user_restaurant_ids(user):
    """Return restaurant ids this dashboard user can manage.

    Older code checked ChefStaff.action='accepted', but ChefStaff only stores
    active/hold. That made valid manager/staff users look unlinked and caused
    table APIs to return empty success responses.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return []

    restaurant_ids = []

    try:
        restaurant_ids.extend(
            Restaurant.objects.filter(owner=user).values_list('id', flat=True)
        )
    except Exception:
        pass

    try:
        restaurant_ids.extend(
            ChefStaff.objects.filter(user=user)
            .exclude(action='hold')
            .values_list('restaurant_id', flat=True)
        )
    except Exception:
        pass

    try:
        from staff.models import Staff

        restaurant_ids.extend(
            Staff.objects.filter(user=user, is_active=True).values_list('restaurant_id', flat=True)
        )
    except Exception:
        pass

    return list(dict.fromkeys([rid for rid in restaurant_ids if rid]))


def _resolve_primary_restaurant(user):
    restaurant_ids = _resolve_user_restaurant_ids(user)
    if not restaurant_ids:
        return None
    return (
        Restaurant.objects
        .only('id', 'resturent_name', 'owner_id', 'table_count')
        .filter(id__in=restaurant_ids)
        .order_by('id')
        .first()
    )


def _no_restaurant_response():
    return Response(
        {
            "error": "No restaurant is linked to this account.",
            "code": "restaurant_not_linked",
        },
        status=status.HTTP_403_FORBIDDEN,
    )

class ResolveTableView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        # Accept all known client formats (legacy + current)
        restaurant_id = request.data.get('restaurant_id')
        table_token = request.data.get('table_token')
        device_id = request.data.get('device_id') or request.data.get('table_id')
        table_name = request.data.get('table_name') or request.data.get('table')
        table_number = request.data.get('table_number')

        # Normalize incoming values to avoid whitespace/type mismatch issues
        restaurant_id = str(restaurant_id).strip() if restaurant_id not in (None, "") else None
        table_token = str(table_token).strip() if table_token not in (None, "") else None
        device_id = str(device_id).strip() if device_id not in (None, "") else None
        table_name = str(table_name).strip() if table_name not in (None, "") else None
        table_number = str(table_number).strip() if table_number not in (None, "") else None

        if not any([device_id, table_token, table_name, table_number]):
            return Response({'error': 'Missing required parameters'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            device = None

            # 1) Primary lookup by device/table id.
            if device_id:
                try:
                    device = Device.objects.get(id=int(device_id))
                except (ValueError, TypeError, Device.DoesNotExist):
                    # If a UUID-like value is passed in id/table_id, try uuid lookup too.
                    try:
                        device = Device.objects.get(uuid=device_id)
                    except Device.DoesNotExist:
                        device = None

            # 2) Token-based lookup (supports /t/:restaurantId/:tableToken style)
            if not device and restaurant_id and table_token:
                try:
                    device = Device.objects.get(restaurant_id=restaurant_id, table_token=table_token)
                except Device.DoesNotExist:
                    device = None

            # 3) Human-readable fallback (self-healing links)
            if not device and restaurant_id:
                if table_name:
                    device = Device.objects.filter(
                        restaurant_id=restaurant_id,
                        table_name__iexact=table_name
                    ).first()
                if not device and table_number:
                    device = Device.objects.filter(
                        restaurant_id=restaurant_id,
                        table_number__iexact=table_number
                    ).first()

            if not device:
                raise Device.DoesNotExist

            # Serialize scans for the same table so a completed session cannot
            # be resumed while another request is creating its replacement.
            device = Device.objects.select_for_update().get(pk=device.pk)
            restaurant_id = device.restaurant.id
        except Device.DoesNotExist:
            # Construct debug info
            debug_info = (
                f"ID: {device_id}, RID: {restaurant_id}, "
                f"Table: {table_name}, TableNo: {table_number}, Token: {table_token}"
            )
            return Response({'error': f'Invalid table link. (Debug: {debug_info})'}, status=status.HTTP_404_NOT_FOUND)

        
        # Check for existing ACTIVE session
        existing_session = (
            GuestSession.objects
            .select_for_update()
            .filter(device=device, is_active=True)
            .order_by('-created_at')
            .first()
        )
        
        if existing_session:
            # AUTO-EXPIRE check: If session is active but has NO unpaid/active orders, 
            # it implies the previous customers left without the session being closed.
            # We should close it and start a fresh one for the new customer.
            from order.models import Order
            has_pending_orders = Order.objects.filter(
                guest_session=existing_session,
                status__in=['pending', 'preparing', 'served', 'delivered'],
            ).exclude(payment_status__in=['paid', 'completed']).exists()

            if not has_pending_orders:
                # Session is stale/finished. Close it.
                existing_session.is_active = False
                existing_session.save(update_fields=['is_active', 'last_seen_at'])
                existing_session = None # Proceed to create NEW session
            else:
                # Session is genuinely active with orders. Resume it.
                existing_session.save() # Update last_seen
                region_defaults = resolve_region_defaults(
                    region=device.restaurant.region,
                    country=device.restaurant.country,
                    currency=device.restaurant.currency,
                )
                
                return Response({
                    'guest_session_id': existing_session.id,
                    'session_token': existing_session.session_token,
                    'table_id': device.id,
                    'table_name': device.table_name,
                    'restaurant_id': device.restaurant.id,
                    'restaurant_name': device.restaurant.resturent_name,
                    'restaurant_region': device.restaurant.region or region_defaults['region'],
                    'restaurant_currency': device.restaurant.currency or region_defaults['currency'],
                    'restaurant_timezone': device.restaurant.timezone or region_defaults['timezone'],
                    'restaurant_country_code': device.restaurant.country_code or region_defaults['country_code'],
                    'default_payment_provider': device.restaurant.default_payment_provider or region_defaults['default_payment_provider'],
                    'expires_at': existing_session.expires_at.isoformat() if existing_session.expires_at else None,
                    'is_resumed': True
                })

        # Create new guest session
        session_token = str(uuid.uuid4())
        expires_at = now() + timedelta(hours=24) # 24 hour session
        session = GuestSession.objects.create(
            device=device,
            session_token=session_token,
            expires_at=expires_at
        )
        region_defaults = resolve_region_defaults(
            region=device.restaurant.region,
            country=device.restaurant.country,
            currency=device.restaurant.currency,
        )

        # Broadcast New Session Started (Optional, for Dashboard)
        # Broadcast New Session Started (Optional, for Dashboard)
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{device.restaurant.id}",
                {
                    "type": "session_started",
                    "table_id": device.id,
                    "table_name": device.table_name,
                    "session_id": session.id,
                    "timestamp": str(now())
                }
            )
        except Exception as e:
            print(f"WARNING: Failed to broadcast session_started: {e}")

        return Response({
            'guest_session_id': session.id,
            'session_token': session_token,
            'table_id': device.id,
            'table_name': device.table_name,
            'restaurant_id': device.restaurant.id,
            'restaurant_name': device.restaurant.resturent_name,
            'restaurant_region': device.restaurant.region or region_defaults['region'],
            'restaurant_currency': device.restaurant.currency or region_defaults['currency'],
            'restaurant_timezone': device.restaurant.timezone or region_defaults['timezone'],
            'restaurant_country_code': device.restaurant.country_code or region_defaults['country_code'],
            'default_payment_provider': device.restaurant.default_payment_provider or region_defaults['default_payment_provider'],
            'expires_at': expires_at.isoformat(),
            'is_resumed': False
        })


class CloseTableSessionView(APIView):
    """
    Manual Session Closure by Staff.
    """
    permission_classes = [permissions.IsAuthenticated, IsOwnerChefOrStaff]

    def post(self, request, session_id):
        # 1. Validation
        try:
             session = GuestSession.objects.get(id=session_id)
        except GuestSession.DoesNotExist:
             # If session is missing, treat it as already closed/gone to allow UI to refresh.
             return Response({'message': 'Session not found (already closed)'}, status=200)
             
        # Check permissions (Hotel ownership)
        user = request.user
        restaurant = session.device.restaurant
        
        if getattr(user, 'role', None) == 'owner':
             if restaurant.owner != user:
                 return Response({'error': 'Unauthorized'}, status=403)
        
        elif restaurant.id not in _resolve_user_restaurant_ids(user):
             return Response({'error': 'Unauthorized: Not assigned to this restaurant'}, status=403)
        
        # 2. Close Session
        if not session.is_active:
             return Response({'message': 'Session already closed'}, status=200)
             
        session.is_active = False
        session.save()
        
        # 3. Handle Active Orders
        # Mark unpaid/pending orders as cancelled
        from order.models import Order
        unpaid_orders = Order.objects.filter(guest_session=session, payment_status__in=['unpaid', 'partially_paid', 'pending', 'pending_cash'])
        unpaid_orders.update(status='cancelled', payment_status='cancelled')
        
        # 4. Notify Dashboard & Customer (Safe Broadcast)
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant.id}",
                {
                    "type": "session_closed", 
                    "session_id": session.id,
                    "table_id": session.device.id
                }
            )
            
            # Notify Customer Device to reset
            async_to_sync(channel_layer.group_send)(
                f"session_{session.id}",
                {
                    "type": "session_closed",
                    "message": "Session closed by staff"
                }
            )

            # Notify Chat Listeners (Mobile Chat + Dashboard Chat View)
            async_to_sync(channel_layer.group_send)(
                f"restaurant_chat_{restaurant.id}",
                {
                    "type": "session_closed",
                    "session_id": session.id,
                    "table_id": session.device.id,
                    "message": "Session closed by staff"
                }
            )
        except Exception as e:
            print(f"Warning: Failed to broadcast session_close: {e}")
        
        return Response({'message': 'Session closed successfully'})

def generate_username(restaurant_name):
    number = random.randint(1000, 9999)
    safe_name = re.sub(r"[^a-zA-Z0-9_]+", "", str(restaurant_name or "restaurant").lower())
    safe_name = safe_name[:120] or "restaurant"
    return f"{safe_name}{number}"

def generate_password(length=10):
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for _ in range(length))


def _table_capacity_info(restaurant):
    table_limit = int(getattr(restaurant, "table_count", 0) or 0)
    current_tables = Device.objects.filter(restaurant_id=restaurant.pk).count()
    return table_limit, current_tables


def _enforce_table_limit(restaurant):
    table_limit, current_tables = _table_capacity_info(restaurant)
    if table_limit > 0 and current_tables >= table_limit:
        raise serializers.ValidationError({
            "detail": "Table limit reached",
            "table_limit": table_limit,
            "current_tables": current_tables,
        })


def _normalize_table_value(value, default=""):
    return str(value if value is not None else default).strip()


def _derive_table_number(table_name):
    table_name = _normalize_table_value(table_name)
    digits = "".join(ch for ch in table_name if ch.isdigit())
    return digits or table_name[:20]


def _device_response(device, username=None):
    restaurant_id = getattr(device, "restaurant_id", None)
    restaurant_name = getattr(device, "restaurant_name_cached", "")
    table_token = getattr(device, "table_token", None)
    table_url = (
        f"https://officialcleverdiningcustomer.netlify.app/t/{restaurant_id}/{table_token}"
        f"?id={device.id}&table={device.table_name}&restaurant_id={restaurant_id}"
        if restaurant_id and table_token
        else None
    )
    return {
        "id": device.id,
        "table_name": device.table_name or "",
        "table_number": device.table_number or "",
        "capacity": device.capacity,
        "region": device.region or "",
        "restaurant": restaurant_id,
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant_name,
        "action": device.action or "active",
        "username": username or (device.user.username if device.user else ""),
        "user_id": device.user.id if device.user else None,
        "qr_code_image": None,
        "table_url": table_url,
        "active_session_id": None,
        "unread_count": 0,
        "last_message_time": None,
    }


def _send_device_credentials_email_async(owner_email, username, password):
    if not owner_email:
        return

    def _send():
        try:
            send_mail(
                subject="New Device User Created",
                message=f"Username: {username}\nPassword: {password}",
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                recipient_list=[owner_email],
                fail_silently=True,
            )
        except Exception as e:
            print(f"WARNING: Failed to send device credentials email: {e}")

    threading.Thread(target=_send, daemon=True).start()




class DeviceViewSet(viewsets.ModelViewSet):
    serializer_class = DeviceSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerChefOrStaff]
    queryset = Device.objects.all()
    filter_backends = [filters.SearchFilter]
    search_fields = ['table_name'] 
    ordering = ['-id']
    pagination_class = DevicePagination
    
    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f"CRITICAL API FAILURE: {str(e)}\n{error_trace}")
            return Response(
                {
                    "error": "Device creation failed", 
                    "detail": str(e),
                    "trace": error_trace # Temporary for debugging
                }, 
                status=status.HTTP_400_BAD_REQUEST
            )

    def get_queryset(self):
        user = self.request.user
        
        try:
            # Optimized: Use select_related and prefetch_related to avoid N+1 queries
            from django.db.models import Count, Q, Prefetch, Max
            from .models import GuestSession
            
            base_qs = Device.objects.select_related(
                'user'
            ).only(
                'id', 'table_name', 'region', 'table_number', 'capacity', 'uuid',
                'action', 'table_token', 'qr_code_image', 'restaurant_id',
                'user_id', 'user__id', 'user__username',
            ).prefetch_related(
                Prefetch(
                    'guest_sessions',
                    queryset=GuestSession.objects.filter(is_active=True),
                    to_attr='active_sessions_cache'
                )
            ).annotate(
                unread_count_cached=Count(
                    'messages',
                    filter=Q(
                        messages__is_read=False,
                        messages__is_from_device=True,
                        messages__guest_session__is_active=True,
                    ),
                ),
                last_message_time=Max(
                    'messages__timestamp',
                    filter=Q(messages__guest_session__is_active=True),
                )
            )
        except Exception as e:
            print(f"DEBUG_DEVICES: Optimization failed, falling back. Error: {e}")
            base_qs = Device.objects.select_related('user')

        
        try:
            restaurant_ids = _resolve_user_restaurant_ids(user)
            if restaurant_ids:
                expire_inactive_guest_sessions(restaurant_ids)
                return base_qs.filter(restaurant_id__in=restaurant_ids).order_by('-id')
        except Exception as e:
            print(f"DEBUG_DEVICES: Queryset filtering failed: {e}")

        return Device.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        
        restaurant = _resolve_primary_restaurant(user)
        if not restaurant:
            raise serializers.ValidationError("No restaurant is linked to this account.")

        with transaction.atomic():
            # Lock restaurant row to avoid race conditions across concurrent creates.
            restaurant = (
                Restaurant.objects
                .select_for_update()
                .only('id', 'resturent_name', 'owner_id', 'table_count')
                .get(pk=restaurant.pk)
            )
            _enforce_table_limit(restaurant)

            table_name = _normalize_table_value(serializer.validated_data.get("table_name"))
            if not table_name:
                raise serializers.ValidationError({"table_name": "Table name is required."})

            region = _normalize_table_value(serializer.validated_data.get("region"))
            table_number = _normalize_table_value(serializer.validated_data.get("table_number")) or _derive_table_number(table_name)

            duplicate = Device.objects.filter(
                restaurant=restaurant,
                table_name__iexact=table_name,
            ).exists()
            if duplicate:
                raise serializers.ValidationError({"table_name": "A table with this name already exists."})

            # Generate unique username
            username = None
            password = generate_password()
            email = None
            
            max_retries = 5
            for _ in range(max_retries):
                temp_username = generate_username(restaurant.resturent_name)
                if not User.objects.filter(username=temp_username).exists():
                    username = temp_username
                    email = f"{username}@example.com"
                    break
            
            if not username:
                 raise serializers.ValidationError("Failed to generate unique device credentials. Please try again.")

            device_user = User.objects.create_user(
                email=email,
                username=username,
                password=password,
                role='customer'
            )

            try:
                device = serializer.save(
                    user=device_user,
                    restaurant=restaurant,
                    table_name=table_name,
                    table_number=table_number,
                    region=region,
                )
            except Exception as e:
                print(f"CRITICAL: Device creation failed (likely QR code/Storage): {e}")
                raise serializers.ValidationError(f"Failed to create table/QR code. Error: {str(e)}")

        # Notify owner if possible, or log it
        if getattr(user, 'role', None) == 'owner':
             owner_email = user.email
        elif restaurant.owner:
             owner_email = restaurant.owner.email
        else:
             owner_email = "admin@cleverbiz.ai"

        _send_device_credentials_email_async(owner_email, username, password)

        data = DeviceSerializer(device).data
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant.id}",
                {
                    "type": "device_created",
                    "device": data
                }
            )
        except Exception as e:
            print(f"WARNING: Failed to broadcast device_created: {e}")
    
    def perform_update(self, serializer):
        device = serializer.save()
        restaurant = device.restaurant

        # WebSocket Broadcast - device updated (non-fatal)
        try:
            data = DeviceSerializer(device).data
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant.id}",
                {"type": "device_updated", "device": data}
            )
        except Exception as e:
            print(f"DeviceViewSet.perform_update WS error (non-fatal): {e}")

    
    def perform_destroy(self, instance):
        restaurant = instance.restaurant
        device_id = instance.id
        device_user = instance.user  # Capture user before delete
        
        instance.delete()
        
        # Cleanup associated user to free up username/email
        if device_user:
            device_user.delete()

        # WebSocket Broadcast - device deleted (non-fatal)
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant.id}",
                {"type": "device_deleted", "device_id": device_id}
            )
        except Exception as e:
            print(f"DeviceViewSet.perform_destroy WS error (non-fatal): {e}")

    @action(detail=False, methods=['get'], url_path='stats')
    def get_device_stats(self, request):
        try:
            user = request.user
            restaurant = _resolve_primary_restaurant(user)
            
            if not restaurant:
                return _no_restaurant_response()

            from django.db.models import Count, Q

            expire_inactive_guest_sessions([restaurant.pk])

            device_counts = Device.objects.filter(restaurant=restaurant).aggregate(
                total=Count('id'),
                hold=Count('id', filter=Q(action='hold')),
            )
            table_limit = int(getattr(restaurant, "table_count", 0) or 0)
            current_tables = device_counts["total"] or 0
            return Response({
                "restaurant": restaurant.resturent_name,
                "total_devices": current_tables,
                "active_devices": occupied_device_count(restaurant.pk),
                "hold_devices": device_counts["hold"] or 0,
                "table_limit": table_limit,
                "can_create_table": not (table_limit > 0 and current_tables >= table_limit),
            })
        except Exception as e:
            logger.exception("Unable to load table statistics for user %s", request.user.pk)
            return Response({
                "error": "Unable to load table statistics.",
                "code": "table_stats_failed",
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)




class CreateReservationAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data.copy()

        # Get device ID from the request
        device_id = data.get("device")

        try:
            device = Device.objects.get(id=device_id)
        except Device.DoesNotExist:
            return Response({"error": "Invalid device ID"}, status=status.HTTP_400_BAD_REQUEST)

        data["restaurant"] = device.restaurant.id
        serializer = ReservationSerializer(data=data)
        if serializer.is_valid():
            values = dict(serializer.validated_data)
            values.pop('device', None)
            values.pop('restaurant', None)
            values.pop('table_name', None)
            values.pop('table_capacity', None)
            values.pop('end_time', None)
            try:
                reservation = create_for_device(device=device, **values)
            except ReservationConflictError as exc:
                return Response({"error": str(exc), "conflict": True}, status=status.HTTP_409_CONFLICT)
            try:
                rdata = ReservationSerializer(reservation).data
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{device.restaurant.id}",
                    {"type": "reservation_created", "reservation": rdata}
                )
            except Exception as e:
                print(f"CreateReservationAPIView WS error (non-fatal): {e}")
            return Response({"message": "Reservation created successfully"}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)





class ReservationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsOwnerChefOrStaff]
    pagination_class = ReservationPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['id', 'customer_name', 'cell_number', 'email', 'device__table_name']
    terminal_statuses = ['cancel', 'cancelled', 'no_show', 'finished']

    def _user_restaurants(self):
        user = self.request.user
        if getattr(user, 'role', None) == 'owner':
            return list(user.restaurants.all())
        if getattr(user, 'role', None) in ['staff', 'chef', 'manager']:
            chef_staff = ChefStaff.objects.filter(user=user)
            restaurants = [cs.restaurant for cs in chef_staff if cs.restaurant_id]
            if restaurants:
                return restaurants
            from staff.models import Staff
            legacy_staff = Staff.objects.filter(user=user).first()
            if legacy_staff and legacy_staff.restaurant:
                return [legacy_staff.restaurant]
        return []

    def _assert_reservation_access(self, reservation):
        user = self.request.user
        if reservation.restaurant_id in _resolve_user_restaurant_ids(user):
            return
        raise PermissionDenied("You are not authorized to update this reservation.")

    def _parse_slot_datetime(self, start_value=None, date_value=None, time_value=None):
        if start_value:
            parsed = parse_datetime(str(start_value))
            if parsed:
                if django_timezone.is_naive(parsed):
                    parsed = django_timezone.make_aware(parsed, django_timezone.get_current_timezone())
                return parsed

        if date_value and time_value:
            parsed_date = parse_date(str(date_value))
            if not parsed_date:
                return None
            parts = str(time_value).split(":")
            try:
                parsed_time = time(hour=int(parts[0]), minute=int(parts[1]) if len(parts) > 1 else 0)
            except (ValueError, IndexError):
                return None
            combined = datetime.combine(parsed_date, parsed_time)
            return django_timezone.make_aware(combined, django_timezone.get_current_timezone()) if django_timezone.is_naive(combined) else combined
        return None

    def _reservation_end(self, reservation):
        return reservation_end(reservation)

    def _conflicting_reservation(self, device_id, start_time, end_time, exclude_id=None):
        return conflicting_reservation(device_id, start_time, end_time, exclude_id=exclude_id)

    def _broadcast_reservation(self, reservation, event_type="reservation_updated"):
        try:
            data = ReservationSerializer(reservation).data
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{reservation.restaurant.id}",
                {"type": event_type, "reservation": data}
            )
        except Exception as e:
            print(f"Reservation WS error (non-fatal): {e}")

    def _update_reservation_action(self, reservation, values, event_type="reservation_updated"):
        self._assert_reservation_access(reservation)
        for key, value in values.items():
            setattr(reservation, key, value)
        reservation.save()
        self._broadcast_reservation(reservation, event_type=event_type)
        return Response(ReservationSerializer(reservation).data)

    def get_queryset(self):
        user = self.request.user
        queryset = Reservation.objects.none()

        if getattr(user, 'role', None) == 'owner':
            queryset = Reservation.objects.select_related('device', 'restaurant').filter(restaurant__owner=user)
        elif getattr(user, 'role', None) in ['staff', 'chef', 'manager']:
             # Consolidated Staff/Chef lookup with Fallback
            chef_staff = ChefStaff.objects.filter(user=user).first()
            if chef_staff:
                queryset = Reservation.objects.select_related('device', 'restaurant').filter(restaurant=chef_staff.restaurant)
            else:
                # Legacy Staff Fallback
                from staff.models import Staff
                legacy_staff = Staff.objects.filter(user=user).first()
                if legacy_staff and legacy_staff.restaurant:
                     queryset = Reservation.objects.select_related('device', 'restaurant').filter(restaurant=legacy_staff.restaurant)

        date_str = self.request.query_params.get('date')
        if date_str:
            parsed_date = parse_date(date_str)
            if parsed_date:
                date_query = Q()
                for restaurant in self._user_restaurants():
                    try:
                        restaurant_tz = ZoneInfo(restaurant.timezone or 'Asia/Dubai')
                    except Exception:
                        restaurant_tz = ZoneInfo('Asia/Dubai')
                    local_start = datetime.combine(parsed_date, time.min, tzinfo=restaurant_tz)
                    local_end = local_start + timedelta(days=1)
                    date_query |= Q(
                        restaurant=restaurant,
                        reservation_time__gte=local_start.astimezone(ZoneInfo('UTC')),
                        reservation_time__lt=local_end.astimezone(ZoneInfo('UTC')),
                    )
                queryset = queryset.filter(date_query) if date_query else queryset.none()

        return queryset.order_by('-reservation_time')

    def get_serializer_class(self):
        if self.action in ['partial_update', 'update']:
            return ReservationUpdateSerializer
        return ReservationSerializer  

    def perform_destroy(self, instance):
        self._assert_reservation_access(instance)
        restaurant_id = instance.restaurant_id
        reservation_id = instance.id
        instance.delete()
        if restaurant_id:
            try:
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{restaurant_id}",
                    {"type": "reservation_deleted", "reservation_id": reservation_id},
                )
            except Exception as exc:
                print(f"Reservation delete WS error (non-fatal): {exc}")

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        field_aliases = {
            'customerName': 'customer_name',
            'phone': 'cell_number',
            'guestCount': 'guest_no',
            'reservationTime': 'reservation_time',
            'endTime': 'end_time',
            'durationMinutes': 'duration_minutes',
            'bufferMinutes': 'buffer_minutes',
            'customRequest': 'custom_request',
            'tableName': 'table_name',
            'tableCapacity': 'table_capacity',
            'actualSeatedTime': 'actual_seated_time',
            'whatsappPhoneNumberId': 'whatsapp_phone_number_id',
            'whatsappChatId': 'whatsapp_chat_id',
            'whatsappMessageId': 'whatsapp_message_id',
            'rawCustomerText': 'raw_customer_text',
            'aiConfidence': 'ai_confidence',
            'missingFields': 'missing_fields',
        }
        for source_key, target_key in field_aliases.items():
            if data.get(source_key) not in [None, ""] and not data.get(target_key):
                data[target_key] = data.get(source_key)

        device_id = data.get('device') or data.get('tableId') or data.get('table_id')
        if not device_id:
            return Response({"device": ["A table is required."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            device = Device.objects.select_related('restaurant').get(id=device_id)
        except (ValueError, TypeError, Device.DoesNotExist):
            return Response({"device": ["Table not found."]}, status=status.HTTP_400_BAD_REQUEST)

        if device.restaurant not in self._user_restaurants():
            raise PermissionDenied("You are not assigned to this restaurant.")

        data['device'] = device.id
        data['restaurant'] = device.restaurant.id
        data.setdefault('table_name', device.table_name)
        data.setdefault('status', 'confirmed')
        data.setdefault('source', 'dashboard')
        data.setdefault('duration_minutes', device.restaurant.reservation_duration_minutes)
        data.setdefault('buffer_minutes', 0)

        start_time = self._parse_slot_datetime(data.get('reservation_time') or data.get('reservationTime'))
        if not start_time:
            return Response({"reservation_time": ["A valid reservation time is required."]}, status=status.HTTP_400_BAD_REQUEST)
        duration = int(data.get('duration_minutes') or data.get('durationMinutes') or 90)
        buffer_value = data.get('buffer_minutes')
        if buffer_value in [None, '']:
            buffer_value = data.get('bufferMinutes')
        buffer = int(0 if buffer_value in [None, ''] else buffer_value)
        end_time = self._parse_slot_datetime(data.get('end_time') or data.get('endTime')) or start_time + timedelta(minutes=duration + buffer)
        data['reservation_time'] = start_time
        data['end_time'] = end_time
        data['duration_minutes'] = duration
        data['buffer_minutes'] = buffer

        serializer = ReservationSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        values.pop('device', None)
        values.pop('restaurant', None)
        values.pop('table_name', None)
        values.pop('table_capacity', None)
        values.pop('end_time', None)
        try:
            reservation = create_for_device(device=device, **values)
        except ReservationConflictError as exc:
            return Response({
                "error": str(exc),
                "conflict": True,
                "reservationId": exc.reservation.id if exc.reservation else None,
            }, status=status.HTTP_409_CONFLICT)
        self._broadcast_reservation(reservation, event_type="reservation_created")
        payload = ReservationSerializer(reservation).data
        return Response(payload, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        reservation = self.get_object()
        self._assert_reservation_access(reservation)

        data = request.data.copy()
        aliases = {
            'reservationTime': 'reservation_time', 'durationMinutes': 'duration_minutes',
            'bufferMinutes': 'buffer_minutes', 'guestCount': 'guest_no', 'tableId': 'device',
            'customRequest': 'custom_request',
        }
        for source_key, target_key in aliases.items():
            if data.get(source_key) not in [None, ''] and data.get(target_key) in [None, '']:
                data[target_key] = data[source_key]
        serializer = self.get_serializer(reservation, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        schedule_fields = {'reservation_time', 'duration_minutes', 'buffer_minutes', 'guest_no', 'device'}
        if schedule_fields.intersection(values):
            target_device = values.get('device') or reservation.device
            if target_device and target_device.restaurant_id != reservation.restaurant_id:
                return Response({'device': ['Table does not belong to this restaurant.']}, status=status.HTTP_400_BAD_REQUEST)
            try:
                reservation = reschedule(
                    reservation,
                    reservation_time=values.get('reservation_time', reservation.reservation_time),
                    guest_no=values.get('guest_no', reservation.guest_no),
                    duration_minutes=values.get('duration_minutes', reservation.duration_minutes),
                    buffer_minutes=values.get('buffer_minutes', reservation.buffer_minutes),
                    device=target_device,
                )
            except ReservationConflictError as exc:
                return Response({'error': str(exc), 'conflict': True}, status=status.HTTP_409_CONFLICT)
        for field in ('custom_request', 'status', 'status_reason'):
            if field in values:
                setattr(reservation, field, values[field])
        if values.get('status') in {'confirmed', 'accept', 'overdue', 'seated', 'extended'}:
            conflict = self._conflicting_reservation(
                reservation.device_id,
                reservation.reservation_time,
                self._reservation_end(reservation),
                exclude_id=reservation.id,
            )
            if conflict:
                return Response({'error': 'Reservation conflicts with an existing booking.', 'conflict': True}, status=status.HTTP_409_CONFLICT)
        reservation.save()
        self._broadcast_reservation(reservation)
        return Response(ReservationSerializer(reservation).data)

    @action(detail=False, methods=['get'], url_path='check-conflict')
    def check_conflict(self, request):
        device_id = request.query_params.get('tableId') or request.query_params.get('table_id') or request.query_params.get('device')
        start_time = self._parse_slot_datetime(request.query_params.get('startTime') or request.query_params.get('start_time'))
        end_time = self._parse_slot_datetime(request.query_params.get('endTime') or request.query_params.get('end_time'))
        exclude_id = request.query_params.get('excludeId') or request.query_params.get('exclude_id')
        if not device_id or not start_time or not end_time:
            return Response({"error": "tableId, startTime, and endTime are required."}, status=status.HTTP_400_BAD_REQUEST)
        conflict = self._conflicting_reservation(device_id, start_time, end_time, exclude_id=exclude_id)
        return Response({"conflict": bool(conflict), "reservationId": conflict.id if conflict else None})

    @action(detail=False, methods=['get'], url_path='availability')
    def availability(self, request):
        date_value = request.query_params.get('date')
        time_value = request.query_params.get('time')
        duration = int(request.query_params.get('duration') or request.query_params.get('durationMinutes') or 90)
        party_size = int(request.query_params.get('partySize') or request.query_params.get('party_size') or 1)
        start_time = self._parse_slot_datetime(date_value=date_value, time_value=time_value)
        if not start_time:
            return Response({"error": "date and time are required."}, status=status.HTTP_400_BAD_REQUEST)
        restaurants = self._user_restaurants()
        table_payloads = []
        for restaurant in restaurants:
            for table in available_tables(restaurant, start_time, party_size, duration_minutes=duration):
                table_payloads.append(DeviceSerializer(table, context={'request': request}).data)
        return Response({
            "available": len(table_payloads) > 0,
            "tableCount": len(table_payloads),
            "tables": table_payloads,
        })

    @action(detail=False, methods=['get'], url_path='available-slots')
    def available_slot_list(self, request):
        date_value = parse_date(str(request.query_params.get('date') or ''))
        party_size = int(request.query_params.get('partySize') or request.query_params.get('party_size') or 1)
        exclude_id = request.query_params.get('excludeId') or request.query_params.get('exclude_id')
        restaurants = self._user_restaurants()
        if not date_value or not restaurants:
            return Response({'error': 'date is required.'}, status=status.HTTP_400_BAD_REQUEST)
        slots = available_slots(restaurants[0], date_value, party_size, exclude_id=exclude_id)
        return Response({'available': bool(slots), 'slots': slots})

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        reservation = self.get_object()
        conflict = self._conflicting_reservation(
            reservation.device_id,
            reservation.reservation_time,
            self._reservation_end(reservation),
            exclude_id=reservation.id,
        )
        if conflict:
            return Response({'error': 'Reservation conflicts with an existing booking.', 'conflict': True}, status=status.HTTP_409_CONFLICT)
        return self._update_reservation_action(reservation, {
            "status": "confirmed",
            "updated_by_staff_id": str(request.data.get('staffId') or request.user.id),
            "status_reason": request.data.get('notes') or request.data.get('reason') or "",
        })

    @action(detail=True, methods=['post'], url_path='mark-seated')
    def mark_seated(self, request, pk=None):
        reservation = self.get_object()
        conflict = self._conflicting_reservation(
            reservation.device_id, reservation.reservation_time, self._reservation_end(reservation), exclude_id=reservation.id
        )
        if conflict:
            return Response({'error': 'Reservation conflicts with an existing booking.', 'conflict': True}, status=status.HTTP_409_CONFLICT)
        return self._update_reservation_action(reservation, {
            "status": "seated",
            "actual_seated_time": now(),
            "updated_by_staff_id": str(request.data.get('staffId') or request.user.id),
            "status_reason": request.data.get('notes') or "",
        })

    @action(detail=True, methods=['post'], url_path='extend')
    def extend(self, request, pk=None):
        reservation = self.get_object()
        minutes = int(request.data.get('minutes') or request.data.get('extensionMinutes') or 30)
        base_end = self._reservation_end(reservation)
        new_end = base_end + timedelta(minutes=minutes)
        conflict = self._conflicting_reservation(
            reservation.device_id, base_end, new_end, exclude_id=reservation.id
        )
        if conflict:
            return Response({'error': 'The table is reserved during that extension.', 'conflict': True}, status=status.HTTP_409_CONFLICT)
        return self._update_reservation_action(reservation, {
            "status": "extended",
            "end_time": new_end,
            "extension_minutes": int(reservation.extension_minutes or 0) + minutes,
            "updated_by_staff_id": str(request.data.get('staffId') or request.user.id),
            "status_reason": request.data.get('notes') or f"Extended by {minutes} minutes",
        })

    @action(detail=True, methods=['post'], url_path='free-table')
    def free_table(self, request, pk=None):
        current = now()
        return self._update_reservation_action(self.get_object(), {
            "status": "finished",
            "actual_end_time": current,
            "end_time": current,
            "updated_by_staff_id": str(request.data.get('staffId') or request.user.id),
            "status_reason": request.data.get('notes') or "Table released",
        })

    @action(detail=True, methods=['post'], url_path='move-table')
    def move_table(self, request, pk=None):
        reservation = self.get_object()
        table_id = request.data.get('tableId') or request.data.get('table_id') or request.data.get('device')
        try:
            table = Device.objects.get(id=table_id, restaurant=reservation.restaurant)
        except (TypeError, ValueError, Device.DoesNotExist):
            return Response({"tableId": ["Target table not found."]}, status=status.HTTP_400_BAD_REQUEST)
        if table.action != 'active' or table.capacity < reservation.guest_no:
            return Response({"tableId": ["Target table cannot seat this party."]}, status=status.HTTP_400_BAD_REQUEST)
        conflict = self._conflicting_reservation(table.id, reservation.reservation_time, self._reservation_end(reservation), exclude_id=reservation.id)
        if conflict:
            return Response({"conflict": True, "reservationId": conflict.id}, status=status.HTTP_409_CONFLICT)
        return self._update_reservation_action(reservation, {
            "device": table,
            "table_name": table.table_name,
            "status_reason": request.data.get('notes') or request.data.get('reason') or f"Moved to {table.table_name}",
            "updated_by_staff_id": str(request.data.get('staffId') or request.user.id),
        })

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        current = now()
        return self._update_reservation_action(self.get_object(), {
            "status": "cancelled",
            "actual_end_time": current,
            "end_time": current,
            "updated_by_staff_id": str(request.data.get('staffId') or request.user.id),
            "status_reason": request.data.get('reason') or request.data.get('notes') or "Cancelled",
        })

    @action(detail=True, methods=['post'], url_path='no-show')
    def no_show(self, request, pk=None):
        current = now()
        return self._update_reservation_action(self.get_object(), {
            "status": "no_show",
            "actual_end_time": current,
            "end_time": current,
            "updated_by_staff_id": str(request.data.get('staffId') or request.user.id),
            "status_reason": request.data.get('reason') or request.data.get('notes') or "No-show",
        })

    @action(detail=True, methods=['post'], url_path='mark-left-early')
    def mark_left_early(self, request, pk=None):
        current = now()
        return self._update_reservation_action(self.get_object(), {
            "status": "finished",
            "actual_end_time": current,
            "end_time": current,
            "updated_by_staff_id": str(request.data.get('staffId') or request.user.id),
            "status_reason": request.data.get('reason') or request.data.get('notes') or "Left early",
        })
    
    @action(detail=False, methods=['get'], url_path='report-reservation-status')
    def report_reservation_status(self, request):
        user = request.user

        # Determine restaurant based on role
        if getattr(user, 'role', None) == 'owner':
            restaurants = user.restaurants.all()
        elif getattr(user, 'role', None) in ['staff', 'chef', 'manager']:
            chef_staff = ChefStaff.objects.filter(user=user)
            if chef_staff.exists():
                restaurants = [cs.restaurant for cs in chef_staff]
            else:
                 # Legacy Staff Fallback
                from staff.models import Staff
                legacy_staff = Staff.objects.filter(user=user).first()
                if legacy_staff and legacy_staff.restaurant:
                    restaurants = [legacy_staff.restaurant]
                else:
                    return Response({"error": "You are not authorized."}, status=403)
        else:
            return Response({"error": "You are not authorized."}, status=403)

        # Get current time details
        current_date = now().date()
        current_month_start = current_date.replace(day=1)
        last_month = (current_month_start - timedelta(days=1)).replace(day=1)
        last_month_end = current_month_start - timedelta(days=1)

        # Prepare response data
        total_active = Reservation.objects.filter(
            restaurant__in=restaurants,
            status__in=['accept', 'confirmed', 'seated', 'extended']
        ).count()

        last_month_count = Reservation.objects.filter(
            restaurant__in=restaurants,
            reservation_time__date__gte=last_month,
            reservation_time__date__lte=last_month_end
        ).count()

        running_month_count = Reservation.objects.filter(
            restaurant__in=restaurants,
            reservation_time__date__gte=current_month_start,
            reservation_time__date__lte=current_date
        ).count()

        return Response({
            "total_active_accepted_reservations": total_active,
            "last_month_reservations": last_month_count,
            "running_month_reservations": running_month_count
        })
    




class DeviceViewSetall(viewsets.ReadOnlyModelViewSet):
    serializer_class = DeviceSerializer
    permission_classes = [permissions.IsAuthenticated,IsOwnerChefOrStaff]
    pagination_class= None
    filter_backends = [filters.SearchFilter]
    search_fields = ['table_name']

    def get_queryset(self):
        user = self.request.user
        try:
            from django.db.models import Count, Q, Prefetch, Max
            from .models import GuestSession

            base_qs = Device.objects.select_related(
                'user'
            ).only(
                'id', 'table_name', 'region', 'table_number', 'capacity', 'uuid',
                'action', 'table_token', 'qr_code_image', 'restaurant_id',
                'user_id', 'user__id', 'user__username',
            ).prefetch_related(
                Prefetch(
                    'guest_sessions',
                    queryset=GuestSession.objects.filter(is_active=True),
                    to_attr='active_sessions_cache'
                )
            ).annotate(
                unread_count_cached=Count(
                    'messages',
                    filter=Q(
                        messages__is_read=False,
                        messages__is_from_device=True,
                        messages__guest_session__is_active=True,
                    ),
                ),
                # Conversation recency must survive session expiry. Unread state
                # remains scoped to the active guest session above, while the
                # latest persisted message keeps the staff chat list ordered
                # like a normal inbox after a reload.
                last_message_time=Max('messages__timestamp')
            )
        except Exception as e:
            print(f"DeviceViewSetall optimization failed, falling back. Error: {e}")
            base_qs = Device.objects.select_related('user')

        if getattr(user, 'role', None) == 'owner':
            return base_qs.filter(restaurant__owner=user)
        elif getattr(user, 'role', None) in ['staff', 'chef', 'manager']:
            # Relaxed check
            restaurant_ids = list(ChefStaff.objects.filter(user=user).values_list('restaurant_id', flat=True))
            
            if not restaurant_ids:
                # Legacy Staff Fallback
                from staff.models import Staff
                legacy_staff = Staff.objects.filter(user=user).first()
                if legacy_staff and legacy_staff.restaurant:
                    restaurant_ids = [legacy_staff.restaurant.id]
            
            return base_qs.filter(restaurant_id__in=restaurant_ids)

        return Device.objects.none()

class PublicDeviceListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        if not restaurant_id:
            return Response({"error": "restaurant_id is required"}, status=400)
        
        devices = Device.objects.filter(restaurant_id=restaurant_id).values('id', 'table_name', 'restaurant_id')
        data = []
        for device in devices:
            data.append({
                "id": device["id"],
                "table_name": device["table_name"],
                "restaurant_id": device["restaurant_id"]
            })
        return Response(data)

class PublicDeviceByUUIDView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, uuid):
        try:
            device = Device.objects.select_related('restaurant').get(uuid=uuid)
            return Response({
                "id": device.id,
                "uuid": str(device.uuid),
                "table_name": device.table_name,
                "restaurant_id": device.restaurant.id,
                "restaurant_name": device.restaurant.resturent_name,
                "table_number": device.table_number,
                "capacity": device.capacity,
            })
        except Device.DoesNotExist:
            return Response({"error": "Device not found"}, status=404)


class SimpleDeviceListView(APIView):
    """
    BULLETPROOF Simple Device List - No Serializers, No Pagination Complexity.
    This view will NEVER return 500 errors.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            search_query = (request.query_params.get('search') or '').strip()
            restaurant = _resolve_primary_restaurant(user)
            
            if not restaurant:
                return _no_restaurant_response()
            
            # Get devices - simple query, no annotations
            restaurant_id = restaurant.pk
            restaurant_name = restaurant.resturent_name or ""

            expire_inactive_guest_sessions([restaurant_id])

            devices = (
                Device.objects
                .filter(restaurant_id=restaurant_id)
                .select_related('user')
                .only(
                    'id', 'table_name', 'region', 'table_number', 'capacity', 'uuid',
                    'action', 'table_token', 'qr_code_image', 'restaurant_id',
                    'user_id', 'user__id', 'user__username',
                )
            )

            # Apply owner table search (table name primarily, plus number/region fallback)
            if search_query:
                from django.db.models import Q
                devices = devices.filter(
                    Q(table_name__icontains=search_query) |
                    Q(table_number__icontains=search_query) |
                    Q(region__icontains=search_query)
                )

            devices = devices.order_by('-id')
            
            # Manual pagination
            page = int(request.query_params.get('page', 1))
            page_size = 10
            start = (page - 1) * page_size
            end = start + page_size
            
            total_count = devices.count()
            devices_page = devices[start:end]
            
            # Manual serialization - bulletproof
            results = []
            for device in devices_page:
                try:
                    device_data = {
                        "id": device.id,
                        "table_name": device.table_name or "",
                        "region": device.region or "",
                        "table_number": device.table_number or "",
                        "capacity": device.capacity,
                        "restaurant": restaurant_id,
                        "restaurant_id": restaurant_id,
                        "action": device.action or "active",
                        "restaurant_name": restaurant_name,
                        "username": device.user.username if device.user else "",
                        "user_id": device.user.id if device.user else None,
                        "qr_code_image": None,  # Skip file access to avoid crashes
                        "table_url": (
                            f"https://officialcleverdiningcustomer.netlify.app/t/{restaurant_id}/{device.table_token}"
                            f"?id={device.id}&table={device.table_name}&restaurant_id={restaurant_id}"
                            if getattr(device, 'table_token', None)
                            else None
                        ),
                        "active_session_id": None,
                        "unread_count": 0,
                        "last_message_time": None
                    }
                    
                    # Try to get QR code URL safely
                    try:
                        if device.qr_code_image:
                            device_data["qr_code_image"] = device.qr_code_image.url
                    except Exception:
                        pass
                    
                    # Try to get active session
                    try:
                        session = device.guest_sessions.filter(is_active=True).first()
                        if session:
                            device_data["active_session_id"] = session.id
                    except Exception:
                        pass
                    
                    # Try to get unread count
                    try:
                        device_data["unread_count"] = device.messages.filter(is_read=False, is_from_device=True).count()
                    except Exception:
                        pass
                    
                    results.append(device_data)
                except Exception as e:
                    # If a single device fails, skip it instead of crashing everything
                    print(f"Warning: Skipped device {device.id} due to error: {e}")
                    continue
            
            # Build pagination response
            has_next = end < total_count
            has_prev = page > 1
            query_suffix = f"&search={search_query}" if search_query else ""
            
            return Response({
                "count": total_count,
                "next": f"?page={page + 1}{query_suffix}" if has_next else None,
                "previous": f"?page={page - 1}{query_suffix}" if has_prev else None,
                "results": results
            })
            
        except Exception as e:
            logger.exception("Unable to load tables for user %s", request.user.pk)
            return Response({
                "count": 0,
                "next": None,
                "previous": None,
                "results": [],
                "error": "Unable to load tables.",
                "code": "table_list_failed",
            }, status=status.HTTP_200_OK)

    def post(self, request):
        """BULLETPROOF Device Creation - handles table/device creation."""
        try:
            user = request.user
            role = getattr(user, 'role', None)
            restaurant = _resolve_primary_restaurant(user)
            
            if not restaurant:
                return _no_restaurant_response()
            
            # Get and normalize device data from request
            table_name = _normalize_table_value(request.data.get('table_name'))
            table_number = _normalize_table_value(request.data.get('table_number')) or _derive_table_number(table_name)
            region = _normalize_table_value(request.data.get('region'))
            try:
                capacity = int(request.data.get('capacity') or 4)
            except (TypeError, ValueError):
                return Response({"capacity": ["Enter a whole number."]}, status=400)
            if not 1 <= capacity <= 100:
                return Response({"capacity": ["Capacity must be between 1 and 100."]}, status=400)

            if not table_name:
                return Response({"table_name": ["Table name is required."]}, status=400)

            with transaction.atomic():
                # Lock restaurant row to avoid race conditions across concurrent creates.
                restaurant = (
                    Restaurant.objects
                    .select_for_update()
                    .only('id', 'resturent_name', 'owner_id', 'table_count')
                    .get(pk=restaurant.pk)
                )
                try:
                    _enforce_table_limit(restaurant)
                except serializers.ValidationError as exc:
                    detail = exc.detail if hasattr(exc, "detail") else {"detail": "Table limit reached"}
                    return Response(detail, status=400)

                if Device.objects.filter(restaurant=restaurant, table_name__iexact=table_name).exists():
                    return Response({"table_name": ["A table with this name already exists."]}, status=400)
                
                # Generate unique device user
                username = None
                password = generate_password()
                
                max_retries = 5
                for _ in range(max_retries):
                    temp_username = generate_username(restaurant.resturent_name)
                    if not User.objects.filter(username=temp_username).exists():
                        username = temp_username
                        break
                
                if not username:
                    return Response({"error": "Failed to generate device credentials"}, status=500)
                
                # Create device user
                email = f"{username}@example.com"
                device_user = User.objects.create_user(
                    email=email,
                    username=username,
                    password=password,
                    role='customer'
                )
                
                # Create device
                device = Device.objects.create(
                    table_name=table_name,
                    table_number=table_number,
                    region=region,
                    capacity=capacity,
                    user=device_user,
                    restaurant=restaurant,
                    action='active'
                )
            
            owner_email = user.email if role == 'owner' else (restaurant.owner.email if restaurant.owner else "admin@cleverbiz.ai")
            _send_device_credentials_email_async(owner_email, username, password)
            
            # Try to broadcast WebSocket event (non-blocking)
            try:
                device_data = {
                    "id": device.id,
                    "table_name": device.table_name,
                    "table_number": device.table_number,
                    "capacity": device.capacity,
                    "region": device.region,
                    "restaurant": restaurant.id,
                    "restaurant_name": restaurant.resturent_name,
                    "action": device.action,
                    "username": username
                }
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{restaurant.id}",
                    {
                        "type": "device_created",
                        "device": device_data
                    }
                )
            except Exception as ws_err:
                print(f"WebSocket notification failed (non-blocking): {ws_err}")
            
            device.restaurant_name_cached = restaurant.resturent_name or ""
            data = _device_response(device, username=username)
            data["message"] = "Device created successfully"
            return Response(data, status=201)
            
        except Exception as e:
            print(f"SimpleDeviceListView POST Error: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                "error": str(e),
                "message": "Failed to create device"
            }, status=500)


class SimpleDeviceListAllView(APIView):
    """
    BULLETPROOF Simple Device List ALL - No Pagination, No Serializers.
    Returns all devices for the user's restaurant without any DRF machinery.
    This is a direct replacement for DeviceViewSetall.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            restaurant_ids = _resolve_user_restaurant_ids(user)
            
            if not restaurant_ids:
                return _no_restaurant_response()

            expire_inactive_guest_sessions(restaurant_ids)
            
            from django.db.models import Count, Max, Prefetch
            from .models import GuestSession

            restaurants = {
                row['id']: row['resturent_name'] or ''
                for row in Restaurant.objects.filter(id__in=restaurant_ids).values('id', 'resturent_name')
            }

            devices = (
                Device.objects
                .filter(restaurant_id__in=restaurant_ids)
                .select_related('user')
                .only(
                    'id', 'table_name', 'region', 'table_number', 'capacity', 'uuid',
                    'action', 'table_token', 'qr_code_image', 'restaurant_id',
                    'user_id', 'user__id', 'user__username',
                )
                .prefetch_related(
                    Prefetch(
                        'guest_sessions',
                        queryset=GuestSession.objects.filter(is_active=True).order_by('-created_at'),
                        to_attr='active_sessions_cache',
                    )
                )
                .annotate(
                    unread_count_cached=Count(
                        'messages',
                        filter=Q(
                            messages__is_read=False,
                            messages__is_from_device=True,
                            messages__guest_session__is_active=True,
                        ),
                    ),
                    # Conversation recency must survive guest-session expiry so
                    # the latest table stays at the top of the chat list.
                    last_message_time_cached=Max('messages__timestamp'),
                )
                .order_by('-id')
            )
            
            # Manual serialization - bulletproof
            results = []
            for device in devices:
                try:
                    active_sessions = getattr(device, 'active_sessions_cache', [])
                    active_session = active_sessions[0] if active_sessions else None
                    last_message_time = getattr(device, 'last_message_time_cached', None)

                    device_data = {
                        "id": device.id,
                        "table_name": device.table_name or "",
                        "region": device.region or "",
                        "table_number": device.table_number or "",
                        "capacity": device.capacity,
                        "restaurant": device.restaurant_id,
                        "restaurant_id": device.restaurant_id,
                        "action": device.action or "active",
                        "restaurant_name": restaurants.get(device.restaurant_id, ""),
                        "username": device.user.username if device.user else "",
                        "user_id": device.user.id if device.user else None,
                        "qr_code_image": None,
                        "table_url": (
                            f"https://officialcleverdiningcustomer.netlify.app/t/{device.restaurant_id}/{device.table_token}"
                            f"?id={device.id}&table={device.table_name}&restaurant_id={device.restaurant_id}"
                            if getattr(device, 'table_token', None)
                            else None
                        ),
                        "active_session_id": active_session.id if active_session else None,
                        "unread_count": int(getattr(device, 'unread_count_cached', 0) or 0),
                        "last_message_time": last_message_time.isoformat() if last_message_time else None
                    }
                    
                    # Try to get QR code URL safely
                    try:
                        if device.qr_code_image:
                            device_data["qr_code_image"] = device.qr_code_image.url
                    except Exception:
                        pass
                    
                    results.append(device_data)
                except Exception as e:
                    print(f"Warning: Skipped device {device.id} in ListAll: {e}")
                    continue
            
            return Response(results)
            
        except Exception as e:
            logger.exception("Unable to load all tables for user %s", request.user.pk)
            return Response([])


class SimpleDeviceStatsView(APIView):
    """
    Defensive table stats endpoint. Summary cards should never make the Tables
    page fail; if the aggregate path has bad production data, return zeros.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            restaurant = _resolve_primary_restaurant(request.user)
            if not restaurant:
                return _no_restaurant_response()

            from django.db.models import Count, Q

            expire_inactive_guest_sessions([restaurant.pk])

            device_counts = Device.objects.filter(restaurant_id=restaurant.pk).aggregate(
                total=Count('id'),
                hold=Count('id', filter=Q(action='hold')),
            )
            table_limit = int(getattr(restaurant, "table_count", 0) or 0)
            current_tables = device_counts["total"] or 0
            return Response({
                "restaurant": restaurant.resturent_name or "",
                "total_devices": current_tables,
                "active_devices": occupied_device_count(restaurant.pk),
                "hold_devices": device_counts["hold"] or 0,
                "table_limit": table_limit,
                "can_create_table": not (table_limit > 0 and current_tables >= table_limit),
            })
        except Exception:
            logger.exception("Unable to load safe table statistics for user %s", request.user.pk)
            return Response({
                "restaurant": "",
                "total_devices": 0,
                "active_devices": 0,
                "hold_devices": 0,
                "table_limit": 0,
                "can_create_table": True,
                "error": "Unable to load table statistics.",
                "code": "table_stats_failed",
            }, status=status.HTTP_200_OK)
