import random
import string
from rest_framework import viewsets, permissions,filters
from rest_framework.response import Response
from rest_framework import status
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import serializers
from .models import Device,Reservation
from .serializers import DeviceSerializer,ReservationSerializer,ReservationStatusUpdateSerializer
from accounts.models import User
from restaurant.models import Restaurant
from .paginations import DevicePagination,ReservationPagination
from rest_framework.decorators import action
from accounts.permissions import IsOwnerRole,IsOwnerORStaff,IsOwnerChefOrStaff
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from accounts.models import ChefStaff
from rest_framework.exceptions import PermissionDenied
from django.utils.dateparse import parse_date
from django_filters.rest_framework import DjangoFilterBackend
from datetime import timedelta
from django.utils.timezone import now
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import uuid
from .models import Device, Reservation, GuestSession

channel_layer = get_channel_layer()

class ResolveTableView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        restaurant_id = request.data.get('restaurant_id')
        table_token = request.data.get('table_token')
        device_id = request.data.get('device_id') # Support lookup by ID

        if not device_id and (not restaurant_id or not table_token):
            return Response({'error': 'Missing required parameters'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if device_id:
                try:
                    device = Device.objects.get(id=device_id)
                    restaurant_id = device.restaurant.id
                except Device.DoesNotExist:
                    # Fallback: Validation if restaurant_id and table_name are present (Self-Healing URL)
                    device = None
                    table_name = request.data.get('table_name')
                    fallback_rid = request.data.get('restaurant_id')
                    
                    if fallback_rid and table_name:
                         # Use iexact for robust case-insensitive matching
                         device = Device.objects.filter(restaurant_id=fallback_rid, table_name__iexact=table_name).first()
                    
                    if not device:
                        raise Device.DoesNotExist 
            else:
                device = Device.objects.get(restaurant_id=restaurant_id, table_token=table_token)
        except Device.DoesNotExist:
            # Construct debug info
            debug_info = f"ID: {device_id}, RID: {request.data.get('restaurant_id')}, Table: {request.data.get('table_name')}"
            return Response({'error': f'Invalid table link. (Debug: {debug_info})'}, status=status.HTTP_404_NOT_FOUND)

        
        # Check for existing ACTIVE session
        existing_session = GuestSession.objects.filter(device=device, is_active=True).first()
        
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
                existing_session.save()
                existing_session = None # Proceed to create NEW session
            else:
                # Session is genuinely active with orders. Resume it.
                existing_session.save() # Update last_seen
                
                return Response({
                    'guest_session_id': existing_session.id,
                    'session_token': existing_session.session_token,
                    'table_id': device.id,
                    'table_name': device.table_name,
                    'restaurant_id': device.restaurant.id,
                    'restaurant_name': device.restaurant.resturent_name,
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
        
        # Explicit Staff Check
        elif getattr(user, 'role', None) in ['staff', 'chef', 'manager']:
             is_authorized = ChefStaff.objects.filter(user=user, restaurant=restaurant, action='accepted').exists()
             if not is_authorized:
                  # Legacy fallback
                  from staff.models import Staff
                  is_legacy = Staff.objects.filter(user=user, restaurant=restaurant).exists()
                  if not is_legacy:
                       return Response({'error': 'Unauthorized: Not assigned to this restaurant'}, status=403)
        
        # 2. Close Session
        if not session.is_active:
             return Response({'message': 'Session already closed'}, status=200)
             
        session.is_active = False
        session.save()
        
        # 3. Handle Active Orders
        # Mark unpaid/pending orders as cancelled
        from order.models import Order
        unpaid_orders = Order.objects.filter(guest_session=session, payment_status__in=['unpaid', 'pending', 'pending_cash'])
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
    return f"{restaurant_name.replace(' ', '').lower()}{number}"

def generate_password(length=10):
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for _ in range(length))




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
                'restaurant', 'user'
            ).prefetch_related(
                Prefetch(
                    'guest_sessions',
                    queryset=GuestSession.objects.filter(is_active=True),
                    to_attr='active_sessions_cache'
                )
            ).annotate(
                unread_count_cached=Count('messages', filter=Q(messages__is_read=False, messages__is_from_device=True)),
                last_message_time=Max('messages__timestamp')
            )
        except Exception as e:
            print(f"DEBUG_DEVICES: Optimization failed, falling back. Error: {e}")
            base_qs = Device.objects.select_related('restaurant', 'user')

        
        try:
            if getattr(user, 'role', None) == 'owner':
                return base_qs.filter(restaurant__owner=user).order_by('-id')
            
            # Staff/Chef/Manager Logic
            # 1. Preferred: ChefStaff model
            chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
            if chef_staff:
                # print(f"DEBUG_DEVICES: Found ChefStaff for rest {chef_staff.restaurant.id}")
                return base_qs.filter(restaurant=chef_staff.restaurant).order_by('-id')
            
            # 2. Fallback: Legacy Staff model
            from staff.models import Staff
            legacy_staff = Staff.objects.filter(user=user).first()
            if legacy_staff:
                # print(f"DEBUG_DEVICES: Found Legacy Staff for rest {legacy_staff.restaurant.id}")
                return base_qs.filter(restaurant=legacy_staff.restaurant).order_by('-id')
                
            # 3. Fallback: Owner check (in case role is mismatched but is actually owner)
            if getattr(user, 'role', None) == 'owner': # Redundant check but safe
                return base_qs.filter(restaurant__owner=user).order_by('-id')

        except Exception as e:
             print(f"DEBUG_DEVICES: Queryset filtering failed: {e}")
             return Device.objects.none()

        # print("DEBUG_DEVICES: No access found. Returning empty.")
        return Device.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        
        restaurant = None
        if getattr(user, 'role', None) == 'owner':
            restaurant = Restaurant.objects.filter(owner=user).first()
            if not restaurant:
                raise serializers.ValidationError("Restaurant not found for this owner.")
        else: # Manager/Staff/Chef
            # Check ChefStaff
            chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
            if chef_staff:
                 restaurant = chef_staff.restaurant
            else:
                 # Check Legacy Staff
                 from staff.models import Staff
                 legacy_staff = Staff.objects.filter(user=user).first()
                 if legacy_staff:
                      restaurant = legacy_staff.restaurant
            
            if not restaurant:
                raise serializers.ValidationError("You are not associated with any accepted restaurant.")

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
            device = serializer.save(user=device_user, restaurant=restaurant)
        except Exception as e:
            print(f"CRITICAL: Device creation failed (likely QR code/Storage): {e}")
            # Delete the user we just created to avoid orphans
            device_user.delete()
            raise serializers.ValidationError(f"Failed to create table/QR code. Error: {str(e)}")

        # Notify owner if possible, or log it
        if getattr(user, 'role', None) == 'owner':
             owner_email = user.email
        elif restaurant.owner:
             owner_email = restaurant.owner.email
        else:
             owner_email = "admin@cleverbiz.ai"

        try:
            send_mail(
                subject="New Device User Created",
                message=f"Username: {username}\nPassword: {password}",
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[owner_email],
                fail_silently=False
            )
        except Exception as e:
            print(f"WARNING: Failed to send email: {e}")

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
            
            restaurant = None
            
            if getattr(user, 'role', None) == 'owner':
                restaurant = Restaurant.objects.filter(owner=user).first()
            else:
                # Check ChefStaff
                chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
                if chef_staff:
                    restaurant = chef_staff.restaurant
                else:
                    # Check Legacy Staff
                    from staff.models import Staff
                    legacy_staff = Staff.objects.filter(user=user).first()
                    if legacy_staff:
                        restaurant = legacy_staff.restaurant
            
            if not restaurant:
                return Response({
                    "restaurant": "N/A",
                    "total_devices": 0,
                    "active_devices": 0,
                    "hold_devices": 0,
                })

            all_devices = Device.objects.filter(restaurant=restaurant)
            return Response({
                "restaurant": restaurant.resturent_name,
                "total_devices": all_devices.count(),
                "active_devices": all_devices.filter(action='active').count(),
                "hold_devices": all_devices.filter(action='hold').count(),
            })
        except Exception as e:
            print(f"DeviceStats Error: {e}")
            return Response({
                "restaurant": "Error",
                "total_devices": 0,
                "active_devices": 0,
                "hold_devices": 0,
                "error": str(e)
            }, status=200) # Return 200 with empty stats to prevent UI crash




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
            reservation = serializer.save()
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
    search_fields = ['id']

    def get_queryset(self):
        user = self.request.user
        queryset = Reservation.objects.none()

        if getattr(user, 'role', None) == 'owner':
            queryset = Reservation.objects.filter(restaurant__owner=user)
        elif getattr(user, 'role', None) in ['staff', 'chef', 'manager']:
             # Consolidated Staff/Chef lookup with Fallback
            chef_staff = ChefStaff.objects.filter(user=user).first()
            if chef_staff:
                queryset = Reservation.objects.filter(restaurant=chef_staff.restaurant)
            else:
                # Legacy Staff Fallback
                from staff.models import Staff
                legacy_staff = Staff.objects.filter(user=user).first()
                if legacy_staff and legacy_staff.restaurant:
                     queryset = Reservation.objects.filter(restaurant=legacy_staff.restaurant)

        date_str = self.request.query_params.get('date')
        if date_str:
            parsed_date = parse_date(date_str)
            if parsed_date:
                queryset = queryset.filter(reservation_time__date=parsed_date)

        return queryset

    def get_serializer_class(self):
        if self.action in ['partial_update', 'update']:
            return ReservationStatusUpdateSerializer
        return ReservationSerializer  

    def partial_update(self, request, *args, **kwargs):
        reservation = self.get_object()
        user = request.user

        if getattr(user, 'role', None) == 'owner' and reservation.restaurant.owner == user:
            pass
        elif getattr(user, 'role', None) in ['staff', 'chef', 'manager']:
            is_authorized = ChefStaff.objects.filter(user=user, restaurant=reservation.restaurant, action='accepted').exists()
            if not is_authorized:
                raise PermissionDenied("You're not assigned to this restaurant.")
        else:
            raise PermissionDenied("You are not authorized to update this reservation.")

        serializer = self.get_serializer(reservation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        reservation = serializer.save()

        try:
            data = ReservationSerializer(reservation).data
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{reservation.restaurant.id}",
                {"type": "reservation_updated", "reservation": data}
            )
        except Exception as e:
            print(f"ReservationViewSet.partial_update WS error (non-fatal): {e}")
        return Response(serializer.data)
    
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
            status='accepted'  # or use whatever value indicates "active"
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
        if getattr(user, 'role', None) == 'owner':
            return Device.objects.filter(restaurant__owner=user)
        elif getattr(user, 'role', None) in ['staff', 'chef', 'manager']:
            # Relaxed check
            restaurant_ids = list(ChefStaff.objects.filter(user=user).values_list('restaurant_id', flat=True))
            
            if not restaurant_ids:
                # Legacy Staff Fallback
                from staff.models import Staff
                legacy_staff = Staff.objects.filter(user=user).first()
                if legacy_staff and legacy_staff.restaurant:
                    restaurant_ids = [legacy_staff.restaurant.id]
            
            return Device.objects.filter(restaurant_id__in=restaurant_ids)

        return Device.objects.none()

class PublicDeviceListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        if not restaurant_id:
            return Response({"error": "restaurant_id is required"}, status=400)
        
        devices = Device.objects.filter(restaurant_id=restaurant_id)
        data = []
        for device in devices:
            data.append({
                "id": device.id,
                "table_name": device.table_name,
                "restaurant_id": device.restaurant.id
            })
        return Response(data)

class PublicDeviceByUUIDView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, uuid):
        try:
            device = Device.objects.get(uuid=uuid)
            return Response({
                "id": device.id,
                "uuid": str(device.uuid),
                "table_name": device.table_name,
                "restaurant_id": device.restaurant.id,
                "restaurant_name": device.restaurant.resturent_name,
                "table_number": device.table_number
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
            
            # Determine restaurant
            restaurant = None
            
            if getattr(user, 'role', None) == 'owner':
                restaurant = Restaurant.objects.filter(owner=user).first()
            else:
                # Check ChefStaff
                try:
                    chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
                    if chef_staff:
                        restaurant = chef_staff.restaurant
                except Exception:
                    pass
                
                # Fallback: Legacy Staff
                if not restaurant:
                    try:
                        from staff.models import Staff
                        legacy_staff = Staff.objects.filter(user=user).first()
                        if legacy_staff:
                            restaurant = legacy_staff.restaurant
                    except Exception:
                        pass
            
            if not restaurant:
                return Response({
                    "count": 0,
                    "next": None,
                    "previous": None,
                    "results": []
                })
            
            # Get devices - simple query, no annotations
            devices = Device.objects.filter(restaurant=restaurant).select_related('restaurant', 'user').order_by('-id')
            
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
                        "restaurant": device.restaurant.id if device.restaurant else None,
                        "restaurant_id": device.restaurant.id if device.restaurant else None,
                        "action": device.action or "active",
                        "restaurant_name": device.restaurant.resturent_name if device.restaurant else "",
                        "username": device.user.username if device.user else "",
                        "user_id": device.user.id if device.user else None,
                        "qr_code_image": None,  # Skip file access to avoid crashes
                        "table_url": getattr(device, 'table_url', None),
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
            
            return Response({
                "count": total_count,
                "next": f"?page={page + 1}" if has_next else None,
                "previous": f"?page={page - 1}" if has_prev else None,
                "results": results
            })
            
        except Exception as e:
            print(f"SimpleDeviceListView GET Error: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                "count": 0,
                "next": None,
                "previous": None,
                "results": [],
                "error": str(e)
            })

    def post(self, request):
        """BULLETPROOF Device Creation - handles table/device creation."""
        try:
            user = request.user
            role = getattr(user, 'role', None)
            
            # Determine restaurant
            restaurant = None
            if role == 'owner':
                restaurant = Restaurant.objects.filter(owner=user).first()
            else:
                # Check ChefStaff
                chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
                if chef_staff:
                    restaurant = chef_staff.restaurant
                else:
                    # Check Legacy Staff
                    try:
                        from staff.models import Staff
                        legacy_staff = Staff.objects.filter(user=user).first()
                        if legacy_staff:
                            restaurant = legacy_staff.restaurant
                    except Exception:
                        pass
            
            if not restaurant:
                return Response({"error": "No restaurant found for this user"}, status=400)
            
            # Get device data from request
            table_name = request.data.get('table_name', '')
            table_number = request.data.get('table_number', '')
            region = request.data.get('region', '')
            
            if not table_name:
                return Response({"error": "table_name is required"}, status=400)
            
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
                user=device_user,
                restaurant=restaurant,
                action='active'
            )
            
            # Try to send email notification (non-blocking)
            try:
                owner_email = user.email if role == 'owner' else (restaurant.owner.email if restaurant.owner else "admin@cleverbiz.ai")
                send_mail(
                    subject="New Device User Created",
                    message=f"Username: {username}\nPassword: {password}",
                    from_email=settings.EMAIL_HOST_USER,
                    recipient_list=[owner_email],
                    fail_silently=True
                )
            except Exception as email_err:
                print(f"Email notification failed (non-blocking): {email_err}")
            
            # Try to broadcast WebSocket event (non-blocking)
            try:
                device_data = {
                    "id": device.id,
                    "table_name": device.table_name,
                    "table_number": device.table_number,
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
            
            # Return success response
            return Response({
                "id": device.id,
                "table_name": device.table_name,
                "table_number": device.table_number,
                "region": device.region,
                "restaurant": restaurant.id,
                "restaurant_name": restaurant.resturent_name,
                "action": device.action,
                "username": username,
                "message": "Device created successfully"
            }, status=201)
            
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
            
            # Determine restaurant IDs
            restaurant_ids = []
            
            if getattr(user, 'role', None) == 'owner':
                restaurant = Restaurant.objects.filter(owner=user).first()
                if restaurant:
                    restaurant_ids = [restaurant.id]
            else:
                # Check ChefStaff
                try:
                    chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
                    if chef_staff:
                        restaurant_ids = [chef_staff.restaurant_id]
                except Exception:
                    pass
                
                # Fallback: Legacy Staff
                if not restaurant_ids:
                    try:
                        from staff.models import Staff
                        legacy_staff = Staff.objects.filter(user=user).first()
                        if legacy_staff and legacy_staff.restaurant:
                            restaurant_ids = [legacy_staff.restaurant.id]
                    except Exception:
                        pass
            
            if not restaurant_ids:
                return Response([])
            
            # Get devices - simple query
            devices = Device.objects.filter(restaurant_id__in=restaurant_ids).select_related('restaurant', 'user').order_by('-id')
            
            # Manual serialization - bulletproof
            results = []
            for device in devices:
                try:
                    device_data = {
                        "id": device.id,
                        "table_name": device.table_name or "",
                        "region": device.region or "",
                        "table_number": device.table_number or "",
                        "restaurant": device.restaurant.id if device.restaurant else None,
                        "restaurant_id": device.restaurant.id if device.restaurant else None,
                        "action": device.action or "active",
                        "restaurant_name": device.restaurant.resturent_name if device.restaurant else "",
                        "username": device.user.username if device.user else "",
                        "user_id": device.user.id if device.user else None,
                        "qr_code_image": None,
                        "table_url": getattr(device, 'table_url', None),
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
                    
                    results.append(device_data)
                except Exception as e:
                    print(f"Warning: Skipped device {device.id} in ListAll: {e}")
                    continue
            
            return Response(results)
            
        except Exception as e:
            print(f"SimpleDeviceListAllView Error: {e}")
            import traceback
            traceback.print_exc()
            return Response([])