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
            # Check if session should be expired? (e.g. > 24 hours inactive?)
            # For now, we trust is_active and just return it.
            # We can update last_seen_at automatically due to auto_now=True if we save?
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
             return Response({'error': 'Session not found'}, status=404)
             
        # Check permissions (Hotel ownership)
        user = request.user
        restaurant = session.device.restaurant
        
        if user.role == 'owner':
             if restaurant.owner != user:
                 return Response({'error': 'Unauthorized'}, status=403)
        # Add staff checks if needed (IsOwnerChefOrStaff covers it mostly but need to ensure 'accepted')
        
        # 2. Close Session
        if not session.is_active:
             return Response({'message': 'Session already closed'}, status=200)
             
        session.is_active = False
        session.save()
        
        # 3. Handle Active Orders?
        # Requirement: "Clear any open orders tied to session (mark as cancelled or completed based on rules)."
        # Rule: If 'pending'/'preparing' -> Cancel? If 'served' -> Completed?
        # Safe default: Mark unpaid as 'cancelled' if no food made, but usually manual close implies "Done".
        # Let's Mark all UNPAID orders as 'cancelled' or just let them be?
        # Prompt says: "Any active orders must be completed or cancelled."
        
        from order.models import Order
        unpaid_orders = Order.objects.filter(guest_session=session, payment_status__in=['unpaid', 'pending', 'pending_cash'])
        # We'll cancel them to be safe/clean
        unpaid_orders.update(status='cancelled', payment_status='cancelled')
        
        # 4. Notify Dashboard & Customer
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

    def get_queryset(self):
        user = self.request.user
        print(f"DEBUG_DEVICES: Fetching devices for {user.email} Role: {getattr(user, 'role', 'N/A')}")
        
        if user.role == 'owner':
            return Device.objects.filter(restaurant__owner=user).order_by('-id')
        
        # Staff/Chef/Manager Logic
        # 1. Preferred: ChefStaff model
        chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
        if chef_staff:
             print(f"DEBUG_DEVICES: Found ChefStaff for rest {chef_staff.restaurant.id}")
             return Device.objects.filter(restaurant=chef_staff.restaurant).order_by('-id')
        
        # 2. Fallback: Legacy Staff model
        from staff.models import Staff
        legacy_staff = Staff.objects.filter(user=user).first()
        if legacy_staff:
             print(f"DEBUG_DEVICES: Found Legacy Staff for rest {legacy_staff.restaurant.id}")
             return Device.objects.filter(restaurant=legacy_staff.restaurant).order_by('-id')
             
        # 3. Fallback: Owner check (in case role is mismatched but is actually owner)
        if user.role == 'owner': # Redundant check but safe
             return Device.objects.filter(restaurant__owner=user).order_by('-id')

        print("DEBUG_DEVICES: No access found. Returning empty.")
        return Device.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        
        restaurant = None
        if user.role == 'owner':
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

        device = serializer.save(user=device_user, restaurant=restaurant)

        # Notify owner if possible, or log it
        if user.role == 'owner':
             owner_email = user.email
        elif restaurant.owner:
             owner_email = restaurant.owner.email
        else:
             owner_email = "admin@cleverbiz.ai"

        send_mail(
            subject="New Device User Created",
            message=f"Username: {username}\nPassword: {password}",
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[owner_email],
            fail_silently=False
        )

        data = DeviceSerializer(device).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{restaurant.id}",
            {
                "type": "device_created",
                "device": data
            }
        )
    
    def perform_update(self, serializer):
        device = serializer.save()
        restaurant = device.restaurant

        # 🔥 WebSocket Broadcast - device updated
        data = DeviceSerializer(device).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{restaurant.id}",
            {
                "type": "device_updated",
                "device": data
            }
        )

    
    def perform_destroy(self, instance):
        restaurant = instance.restaurant
        device_id = instance.id
        device_user = instance.user # Capture user before delete
        
        instance.delete()
        
        # Cleanup associated user to free up username/email
        if device_user:
            device_user.delete()

        # 🔥 WebSocket Broadcast - device deleted
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{restaurant.id}",
            {
                "type": "device_deleted",
                "device_id": device_id
            }
        )

    @action(detail=False, methods=['get'], url_path='stats')
    def get_device_stats(self, request):
        user = request.user
        
        restaurant = None
        
        if user.role == 'owner':
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
            reservation =serializer.save()
            data = ReservationSerializer(reservation).data
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{device.restaurant.id}",
                {
                    "type": "reservation_created",
                    "reservation": data
                }
            )
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

        if user.role == 'owner':
            queryset = Reservation.objects.filter(restaurant__owner=user)
        elif user.role in ['staff', 'chef']:
             # Consolidated Staff/Chef lookup
            chef_staff = ChefStaff.objects.filter(user=user).first()
            if chef_staff:
                queryset = Reservation.objects.filter(restaurant=chef_staff.restaurant)

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

        if user.role == 'owner' and reservation.restaurant.owner == user:
            pass
        elif user.role == 'staff':
            is_chef = ChefStaff.objects.filter(user=user, restaurant=reservation.restaurant).exists()
            if not is_chef:
                raise PermissionDenied("You're not assigned to this restaurant.")
        else:
            raise PermissionDenied("You are not authorized to update this reservation.")

        serializer = self.get_serializer(reservation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        reservation = serializer.save()

        data = ReservationSerializer(reservation).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{reservation.restaurant.id}",
            {
                "type": "reservation_updated",
                "reservation": data
            }
        )
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='report-reservation-status')
    def report_reservation_status(self, request):
        user = request.user

        # Determine restaurant based on role
        if user.role == 'owner':
            restaurants = user.restaurants.all()
        elif user.role == 'staff':
            chef_staff = ChefStaff.objects.filter(user=user)
            restaurants = [cs.restaurant for cs in chef_staff]
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
        if user.role == 'owner':
            return Device.objects.filter(restaurant__owner=user)
        elif user.role in ['staff', 'chef']:
            restaurant_ids = ChefStaff.objects.filter(user=user, action='accepted').values_list('restaurant_id', flat=True)
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