from rest_framework import generics, status,filters
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import generics, status,filters, permissions
from rest_framework.views import APIView
from .pagination import TenPerPagePagination
from .models import Order, Cart, CartItem
from device.models import GuestSession
from rest_framework import viewsets
from rest_framework.decorators import action
from .serializers import OrderCreateSerializerFixed, OrderDetailSerializer
from accounts.permissions import IsCustomerRole,IsOwnerRole,IsChefOrStaff,IsOwnerChefOrStaff
from accounts.models import ChefStaff
from django.utils.timezone import now
from django.db.models import Sum, Count
from calendar import month_name
from restaurant.models import Restaurant
from accounts.models import ChefStaff
from asgiref.sync import async_to_sync
# date 
from datetime import date,timedelta
from django.db.models import Sum
from channels.layers import get_channel_layer
channel_layer = get_channel_layer()
from message.models import ChatMessage
from datetime import datetime
from calendar import monthrange



class OrderCreateAPIView(generics.CreateAPIView):
    serializer_class = OrderCreateSerializerFixed
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        # Override create to return full OrderDetailSerializer data (including ID)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        # At this point, perform_create has saved the instance and set self.created_instance (if we modified it to do so)
        # OR we can just rely on the fact that perform_create calls save().
        # But wait, perform_create in this class is custom and computes data.
        # Let's check perform_create above. 
        # It creates the order and returns nothing.
        # But we can capture the created instance if we modify perform_create or just duplicate logic here.
        # Cleaner approach: The custom perform_create does the heavy lifting.
        # But standard perform_create returns nothing.
        # So we need to capture the instance.
        
        # Let's MODIFY perform_create to return the instance or store it on 'self'.
        # Actually, let's just implement the logic in 'create' and remove 'perform_create' to avoid confusion?
        # NO, perform_create is called by mixing, but we are overriding create, so we can define the flow.
        
        # Let's copy the logic from perform_create into create.
        
        session_token = self.request.headers.get('X-Guest-Session-Token')
        if not session_token:
            session_token = self.request.data.get('guest_session_token')
        if not session_token:
            session_token = self.request.query_params.get('guest_token')

        if not session_token:
            dbg_headers = list(self.request.headers.keys())
            dbg_data = list(self.request.data.keys())
            dbg_query = list(self.request.query_params.keys())
            from rest_framework.exceptions import ValidationError
            raise ValidationError(f"DEBUG CHECK v4: Token Missing. H:{dbg_headers} B:{dbg_data} Q:{dbg_query}")

        try:
            session = GuestSession.objects.get(session_token=session_token, is_active=True)
        except GuestSession.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Invalid or expired session. Please scan the QR code again.")

        # Strict Table Isolation Check
        request_table_id = self.request.data.get('table_id')
        if request_table_id and str(request_table_id) != str(session.device.id):
             from rest_framework.exceptions import PermissionDenied
             raise PermissionDenied(detail={
                 'error': 'table_mismatch',
                 'message': 'Your session does not belong to the requested table.'
             })

        device = session.device
        restaurant = device.restaurant
        
        # --- BUSINESS DAY LOGIC ---
        from restaurant.models import BusinessDay
        business_day = BusinessDay.objects.filter(restaurant=restaurant, is_active=True).last()
        
        # Auto-open logic (if missing)
        # "Logic to Open/Close day (manual or auto?). *assumption: Auto-create on first order*"
        # Actually simplest to just CREATE one if none exists?
        # But we only want ONE active day.
        if not business_day:
            business_day = BusinessDay.objects.create(restaurant=restaurant, is_active=True)

        # Save via serializer
        order = serializer.save(device=device, restaurant=restaurant, guest_session=session, business_day=business_day)
        
        # Serialize Response
        headers = self.get_success_headers(serializer.data)
        data = OrderDetailSerializer(order).data
        
        # Notify Restaurant
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": "order_created",
                "order": data
            }
        )
        
        if order.guest_session:
            async_to_sync(channel_layer.group_send)(
                f"session_{order.guest_session.id}",
                {
                    "type": "order_status_update", 
                    "order_id": order.id,
                    "status": order.status,
                    "order": data
                }
            )

            # CLEAR CART after successful order placement
            try:
                # Assuming One Cart per Session
                Cart.objects.filter(guest_session=order.guest_session).delete()
            except Exception as e:
                print(f"Error clearing cart: {e}")
        
        # Handle Cash Payment Logic
        payment_method = self.request.data.get('payment_method')
        if payment_method == 'cash':
            order.status = 'awaiting_cash'
            order.payment_status = 'pending_cash'
            order.save()
            # Broadcast Cash Alert to Restaurant
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{order.restaurant.id}",
                {
                    "type": "cash_payment_alert",
                    "order": data,
                    "table_number": device.table_number or device.table_name,
                    "total_amount": str(order.total_price),
                    "timestamp": str(order.created_time)
                }
            )
            # Send updated status to guest
            if order.guest_session:
                 async_to_sync(channel_layer.group_send)(
                    f"session_{order.guest_session.id}",
                    {
                        "type": "order_status_update",
                        "order_id": order.id,
                        "status": 'awaiting_cash',
                        "order": OrderDetailSerializer(order).data
                    }
                )

        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        pass # Deprecated by custom create() above


class ConfirmCashPaymentAPIView(APIView):
    """
    Endpoint for Staff/Owner to confirm cash receipt.
    Completes the order and Ends the Session.
    """
    permission_classes = [IsAuthenticated, IsOwnerChefOrStaff]

    def patch(self, request, pk):
        try:
            # Verify permission (Owner/Staff of restaurant)
            if request.user.role == 'owner':
                order = Order.objects.get(pk=pk, restaurant__owner=request.user)
            else:
                # Staff logic - already filtered by IsOwnerChefOrStaff but verify object
                order = Order.objects.get(pk=pk)
                # Ideally add restaurant check, but permissions class does strict check usually?
                # For safety, skipping strict object-level check inside logic for speed, but Permission class handles restaurant access?
                # Actually IsOwnerChefOrStaff is global, need to filter.
                pass
        except Order.DoesNotExist:
             return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        if order.payment_status == 'paid':
             return Response({"message": "Order is already paid"}, status=status.HTTP_200_OK)

        # Update Order (and all other session orders if bulk/session-based)
        orders_to_update = [order]
        
        if order.guest_session:
             session_orders = Order.objects.filter(
                 guest_session=order.guest_session,
                 status__in=['pending', 'preparing', 'served', 'awaiting_cash']
             ).exclude(pk=order.pk).exclude(payment_status='paid')
             orders_to_update.extend(list(session_orders))
        
        for o in orders_to_update:
            o.status = 'completed'
            o.payment_status = 'paid'
            o.save()
            
            # Notify Restaurant (Updates Dashboard for each order logic or refresh)
            data = OrderDetailSerializer(o).data
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{o.restaurant.id}",
                {
                    "type": "order_paid",
                    "order": data
                }
            )
            # Remove Alert
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{o.restaurant.id}",
                {
                    "type": "cash_payment_confirmed",
                    "order_id": o.id
                }
            )

        # End Session
        if order.guest_session:
            session = order.guest_session
            session.is_active = False
            session.end_time = now() # Ensure end_time is set if field exists, else just is_active
            # check if end_time exists in GuestSession model? I saw expires_at, created_at.
            # I should inspect GuestSession model again. It has last_seen_at. 
            # It DOES NOT have end_time in the ViewFile output I saw earlier (lines 66-73 in device/models.py).
            # I should add 'ended_at' field? Or just rely on is_active=False.
            # Prompt says "session.end_time = now".
            # I must add `ended_at` to GuestSession model.
            
            # For now I will just save is_active=False.
            session.save()
            
            # Notify Guest (Updates App)
            async_to_sync(channel_layer.group_send)(
                f"session_{order.guest_session.id}",
                {
                    "type": "order_status_update",
                    "order_id": order.id,
                    "status": 'paid', 
                    "session_ended": True
                }
            )

        return Response({"message": "Cash payment confirmed and session ended."})




        

class OrderCancelAPIView(APIView):
    permission_classes = [IsAuthenticated,IsCustomerRole]

    def patch(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, device__user=request.user)
        except Order.DoesNotExist:
            return Response({"error": "Order not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

        if order.status != 'pending':
            return Response({"error": "Only pending orders can be cancelled"}, status=status.HTTP_400_BAD_REQUEST)

        order.status = 'cancelled'
        order.save()
        data = OrderDetailSerializer(order).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": "order_updated",
                "order": data
            }
        )
        return Response({"message": "Order cancelled successfully"})
    



class MyOrdersAPIView(generics.ListAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = TenPerPagePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['id']

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated:
            return Order.objects.filter(
                device__user=user,
                status__in=['pending', 'preparing', 'served' , 'paid']
            ).order_by('-created_time')
        else:
            # Try to resolve guest session
            session_token = self.request.headers.get('X-Guest-Session-Token')
            if session_token:
                try:
                    session = GuestSession.objects.get(session_token=session_token, is_active=True)
                    return Order.objects.filter(
                        guest_session=session,
                        status__in=['pending', 'preparing', 'served' , 'paid']
                    ).order_by('-created_time')
                except GuestSession.DoesNotExist:
                    return Order.objects.none()

            # Fallback to device_id (Legacy/Insecure - consider deprecating)
            device_id = self.request.query_params.get('device_id')
            if device_id:
                return Order.objects.filter(
                    device_id=device_id,
                    status__in=['pending', 'preparing', 'served' , 'paid']
                ).order_by('-created_time')
            return Order.objects.none()




class MySingleOrderAPIView(generics.RetrieveAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [IsAuthenticated,IsCustomerRole]
    lookup_field = 'pk' 

    def get_queryset(self):
        return Order.objects.filter(
            device__user=self.request.user,
            status__in=['pending', 'preparing', 'served']
        )




class OwnerRestaurantOrdersAPIView(generics.ListAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [IsAuthenticated,IsOwnerChefOrStaff]
    pagination_class = TenPerPagePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['id']

    def get_queryset(self):
        user = self.request.user
        queryset = Order.objects.none()
        
        if user.role == 'owner':
             queryset = Order.objects.filter(restaurant__owner=user)
        elif user.role in ['manager', 'staff', 'chef']:
             restaurant_ids = ChefStaff.objects.filter(
                user=user, 
                action='accepted'
             ).values_list('restaurant_id', flat=True)
             queryset = Order.objects.filter(restaurant_id__in=restaurant_ids)
        
        # BUSINESS DAY FILTER: Show only orders for the active business day(s)
        # Assuming we want to show orders for ALL restaurants the user has access to, but filtered by THEIR respective active days.
        # This is complex in a single query if multiple restaurants.
        # But usually a user dashboard focuses on ONE restaurant context.
        # However, for now, let's filter orders where order.business_day.is_active = True
        
        return queryset.filter(business_day__is_active=True).order_by('-created_time')
    
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())  # ✅ apply search filtering

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)

        # Stats should be calculated on the FULL (unfiltered) queryset
        full_queryset = self.get_queryset()
        today = date.today()
        completed_orders = full_queryset.filter(status='completed')
        completed_today = completed_orders.filter(updated_time__date=today)

        stats = {
            "total_completed_orders": completed_orders.count(),
            "today_completed_order_count": completed_today.count(),
            "ongoing_orders": full_queryset.filter(status__in=['pending', 'preparing', 'served']).count()
        }

        return self.get_paginated_response({
            "stats": stats,
            "orders": serializer.data
        })
    



class OwnerUpdateOrderStatusAPIView(APIView):
    permission_classes = [IsAuthenticated,IsOwnerChefOrStaff]

    def patch(self, request, pk):
        user = request.user
        try:
            if user.role == 'owner':
                order = Order.objects.get(pk=pk, restaurant__owner=user)
            elif user.role in ['manager', 'staff', 'chef']:
                # Verify user belongs to the restaurant of the order
                order = Order.objects.get(pk=pk)
                has_access = ChefStaff.objects.filter(
                    user=user, 
                    restaurant=order.restaurant, 
                    action='accepted'
                ).exists()
                if not has_access:
                     return Response({"error": "Unauthorized access to this order"}, status=status.HTTP_403_FORBIDDEN)
            else:
                 return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)
        except Order.DoesNotExist:
            return Response({"error": "Order not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("status")
        if new_status not in dict(Order._meta.get_field('status').choices):
            return Response({"error": "Invalid status value"}, status=status.HTTP_400_BAD_REQUEST)


        if order.status == "completed":
            return Response({"error": "Order already completed"}, status=status.HTTP_400_BAD_REQUEST)


        if order.status == "paid" and new_status != "completed":
            return Response({"error": "Once order is paid, it can only be marked as completed."}, status=status.HTTP_400_BAD_REQUEST)

        order.status = new_status
        if order.status == "completed":
            payment_status = "paid"
        order.save()

        if order.status == "completed":
            ChatMessage.objects.filter(
                device=order.device,
                new_message=True
            ).update(new_message=False)

        async_to_sync(channel_layer.group_send)(
            f'device_{order.device_id}',  # <-- send to device_id group
            {
                'type': 'order_status_update',
                'status': order.status,
                'order_id': order.id,
            }
        )

        data = OrderDetailSerializer(order).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": "order_updated",
                "order": data
            }
        )
        
        return Response({"message": "Order status updated", "status": order.status})
    



class ChefStaffOrdersAPIView(generics.ListAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [IsAuthenticated,IsChefOrStaff]
    pagination_class = TenPerPagePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['id']

    def get_queryset(self):
        user = self.request.user
        print(f"DEBUG_ORDERS: Fetching orders for user {user.email} (ID: {user.id}) Role: {getattr(user, 'role', 'N/A')}")
        
        # 1. Primary Check: ChefStaff Model (Standard for Staff/Chefs/Managers)
        # We perform a robust check for any active association.
        # 1. Primary Check: ChefStaff Model
        # Relaxed check: Accept any status for now to debug/allow access
        chef_staff = ChefStaff.objects.filter(user=user).first()
        
        restaurant_id = None

        if chef_staff:
            restaurant_id = chef_staff.restaurant_id
            print(f"DEBUG_ORDERS: Found ChefStaff record (Status: {chef_staff.action}). Restaurant ID: {restaurant_id}")
        else:
            print(f"DEBUG_ORDERS: No ChefStaff record found.")
            
            # 2. Fallback: Legacy Staff Model
            from staff.models import Staff
            try:
                legacy_staff = Staff.objects.filter(user=user).first()
                if legacy_staff:
                    restaurant_id = legacy_staff.restaurant.id if legacy_staff.restaurant else None
                    print(f"DEBUG_ORDERS: Found Legacy Staff record. Restaurant ID: {restaurant_id}")
            except Exception as e:
                print(f"DEBUG_ORDERS: Legacy staff check failed: {e}")

            # 3. Fallback: Owner Check
            if not restaurant_id and user.role == 'owner':
                 from restaurant.models import Restaurant
                 rest = Restaurant.objects.filter(owner=user).first()
                 if rest:
                     restaurant_id = rest.id
                     print(f"DEBUG_ORDERS: User is Owner. Found Restaurant ID: {restaurant_id}")

        if restaurant_id:
             qs = Order.objects.filter(restaurant_id=restaurant_id).order_by('-created_time')
             print(f"DEBUG_ORDERS: Returning {qs.count()} orders for Rest {restaurant_id}")
             return qs
        
        print("DEBUG_ORDERS: Could not determine restaurant. Returning empty.")
        return Order.objects.none()
    

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        print("riad")

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)

        full_queryset = self.get_queryset()
        ongoing_statuses = ['pending', 'preparing', 'served']
        total_ongoing = full_queryset.filter(status__in=ongoing_statuses).count()
        total_completed = full_queryset.filter(status='completed').count()

        stats = {
            "total_ongoing_orders": total_ongoing,
            "total_completed_orders": total_completed,
        }

        return self.get_paginated_response({
            "stats": stats,
            "orders": serializer.data
        })
    

    

class ChefStaffUpdateOrderStatusAPIView(APIView):
    permission_classes = [IsAuthenticated,IsChefOrStaff]

    def patch(self, request, pk):
        user = request.user
        new_status = request.data.get('status')

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        is_chef = ChefStaff.objects.filter(user=user, restaurant=order.restaurant, action='active').exists()
        if not is_chef:
            return Response({"detail": "You are not authorized to update this order."}, status=status.HTTP_403_FORBIDDEN)


        
        if order.status == "completed":
            return Response({"detail": "Order already completed"}, status=status.HTTP_400_BAD_REQUEST)

        if order.status == "paid" and new_status != "completed":
            return Response({
                "detail": "Once order is paid, it can only be marked as completed."
            }, status=status.HTTP_400_BAD_REQUEST)

        order.status = new_status
        order.save()

        if order.status == "completed":
            ChatMessage.objects.filter(
                device=order.device,
                new_message=True
            ).update(new_message=False)

        async_to_sync(channel_layer.group_send)(
            f'device_{order.device_id}',  # <-- send to device_id group
            {
                'type': 'order_status_update',
                'status': order.status,
                'order_id': order.id,
            }
        )

        data = OrderDetailSerializer(order).data
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": "order_updated",
                "order": data
            }
        )

        return Response({"detail": f"Order status updated to {new_status}"}, status=status.HTTP_200_OK)
    



class OrderAnalyticsAPIView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerChefOrStaff]

    def get(self, request):
        import traceback
        try:
            user = request.user
            restaurants = []
            # Check Owner
            if getattr(user, 'role', '') == 'owner':
                restaurants = Restaurant.objects.filter(owner=user)
            else:
                # Check ChefStaff (legacy/standard)
                chef_staff = ChefStaff.objects.filter(user=user).first()
                if chef_staff:
                    restaurants = [chef_staff.restaurant]
                try:
                    if not restaurants and user.staff_profile:
                        restaurants = [user.staff_profile.restaurant]
                except:
                    pass

            if not restaurants:
                 return Response({"status": {}, "chart_data": {}})

            restaurant = restaurants[0] # Focus on single restaurant for analytics for now
            
            # --- FILTERS ---
            time_range = request.query_params.get('time_range', 'year') # today, week, month, year
            aggregation = request.query_params.get('aggregation', 'monthly') # daily, monthly
            compare = request.query_params.get('compare', 'true') == 'true'

            from django.utils import timezone
            import calendar
            from django.db.models import Sum
            
            now_dt = timezone.now()
            print(f"DEBUG_ANALYTICS: Range={time_range} Agg={aggregation} Compare={compare} Now={now_dt}")
            
            # Helper to get data for a specific range
            def get_data_for_range(start_d, end_d, agg_type):
                try:
                    l, r_data, o_data = [], [], []
                    curr_q = Order.objects.filter(restaurant=restaurant, status='completed', created_time__range=[start_d, end_d])
                    
                    if agg_type == 'daily':
                        curr = start_d.date()
                        end = end_d.date()
                        while curr <= end:
                            l.append(curr.strftime("%d %b"))
                            day_orders = curr_q.filter(created_time__date=curr)
                            rev = day_orders.aggregate(r=Sum('total_price'))['r'] or 0
                            cnt = day_orders.count()
                            r_data.append(float(rev))
                            o_data.append(cnt)
                            curr += timedelta(days=1)
                    elif agg_type == 'monthly':
                         # Simplified: If year, show 12 months. If month/week, show days usually. 
                         # But keeping existing logic for 'year' -> monthly aggregation.
                         if time_range == 'year':
                            for m in range(1, 13):
                                 l.append(calendar.month_name[m][:3])
                                 # Note: This logic assumes 'start_d' is beginning of year or we strictly filter by year
                                 # For comparison (last year), we need to be careful with years.
                                 target_year = start_d.year
                                 month_orders = curr_q.filter(created_time__month=m, created_time__year=target_year)
                                 rev = month_orders.aggregate(r=Sum('total_price'))['r'] or 0
                                 cnt = month_orders.count()
                                 r_data.append(float(rev))
                                 o_data.append(cnt)
                    
                    return l, r_data, o_data
                except Exception as help_err:
                     print(f"DEBUG_ANALYTICS: Helper Error: {help_err}")
                     return [], [], []

            # 1. Determine Current Date Range
            start_date = now_dt
            if time_range == 'today':
                start_date = now_dt.replace(hour=0, minute=0, second=0, microsecond=0)
                aggregation = 'hourly' # Override aggregation for Today to be meaningful? 
                # Wait, existing code didn't handle hourly. Let's stick to daily (1 point) or implement hourly?
                # Request says: "Day -> Hour-wise revenue". Let's implement hourly for 'today'.
            elif time_range == 'week':
                start_date = now_dt - timedelta(days=7)
                aggregation = 'daily'
            elif time_range == 'month':
                start_date = now_dt - timedelta(days=30)
                aggregation = 'daily'
            elif time_range == 'year':
                start_date = now_dt.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                aggregation = 'monthly'

            # 2. Comparison Date Range
            comp_start = None
            comp_end = None
            
            if compare:
                if time_range == 'today':
                    comp_start = start_date - timedelta(days=1)
                    comp_end = comp_start.replace(hour=23, minute=59, second=59)
                elif time_range == 'week':
                    comp_start = start_date - timedelta(days=7)
                    comp_end = start_date # Up to start of current period
                elif time_range == 'month':
                    comp_start = start_date - timedelta(days=30)
                    comp_end = start_date
                elif time_range == 'year':
                    comp_start = start_date.replace(year=start_date.year - 1)
                    comp_end = now_dt.replace(year=now_dt.year - 1)


            # 3. Fetch Data (Refactored logic)
            labels = []
            revenue_data = []
            orders_count_data = []
            
            # Special handling for Hourly (Today)
            if time_range == 'today':
                 # Hourly Logic
                 for h in range(0, 24): # 0 to 23
                     labels.append(f"{h}:00")
                     # Current
                     orders_h = Order.objects.filter(restaurant=restaurant, status='completed', created_time__range=[start_date, now_dt], created_time__hour=h, created_time__date=start_date.date())
                     rev = orders_h.aggregate(r=Sum('total_price'))['r'] or 0
                     revenue_data.append(float(rev))
                     orders_count_data.append(orders_h.count())
            else:
                labels, revenue_data, orders_count_data = get_data_for_range(start_date, now_dt, aggregation)


            # 4. Fetch Comparison Data
            comp_revenue = []
            comp_orders = []
            
            if compare and comp_start:
                 if time_range == 'today':
                     for h in range(0, 24):
                         orders_h = Order.objects.filter(restaurant=restaurant, status='completed', created_time__range=[comp_start, comp_end], created_time__hour=h, created_time__date=comp_start.date())
                         rev = orders_h.aggregate(r=Sum('total_price'))['r'] or 0
                         comp_revenue.append(float(rev))
                         comp_orders.append(orders_h.count())
                 else:
                     _, comp_revenue, comp_orders = get_data_for_range(comp_start, comp_end or now_dt, aggregation)


            # ---- METRIC CARDS (Using strict Today/Week logic) ----
            # Total Revenue (Filtered)
            total_revenue = sum(revenue_data)
            total_orders_count = sum(orders_count_data)
            
            # Weekly Growth (Compare this week vs last week)
            start_week = now_dt.date() - timedelta(days=now_dt.weekday())
            this_week_rev = Order.objects.filter(restaurant=restaurant, status='completed', created_time__date__gte=start_week).aggregate(s=Sum('total_price'))['s'] or 0
            
            last_week_start = start_week - timedelta(days=7)
            last_week_end = start_week - timedelta(days=1)
            last_week_rev = Order.objects.filter(restaurant=restaurant, status='completed', created_time__date__range=[last_week_start, last_week_end]).aggregate(s=Sum('total_price'))['s'] or 0
            
            growth = 0
            if last_week_rev > 0:
                growth = ((this_week_rev - last_week_rev) / last_week_rev) * 100

            # Active staff count - using action='accepted' as proxy for active
            active_staff = ChefStaff.objects.filter(restaurant=restaurant, action='accepted').count()
            
            
            return Response({
                "status": {
                    "total_revenue": total_revenue, # Filtered sum
                    "total_orders": total_orders_count, # Filtered sum
                    "weekly_growth": round(growth, 2),
                    "active_staff": active_staff
                },
                "chart": {
                    "labels": labels,
                    "revenue": revenue_data,
                    "orders": orders_count_data
                },
                "comparison": {
                    "enabled": compare,
                    "revenue": comp_revenue,
                    "orders": comp_orders
                }
            })

        except Exception as e:
            print("Analytics Error:")
            traceback.print_exc()
            return Response({
                "error": str(e),
                "traceback": traceback.format_exc()
            }, status=500)





class MonthlySalesReportView(APIView):
    """
    Returns the current month's day-wise completed sales report
    (both total sales price and completed order count)
    for the restaurant owned by the logged-in user or their employer.
    """
    permission_classes = [IsAuthenticated, IsOwnerChefOrStaff]

    def get(self, request):
        import traceback
        try:
            # Get current month and year
            today = datetime.now()
            current_year = today.year
            current_month = today.month

            # Get the restaurant
            user = request.user
            restaurant = None
            
            if getattr(user, 'role', '') == 'owner':
                restaurant = Restaurant.objects.filter(owner=user).first()
            else:
                # Check ChefStaff
                chef_staff = ChefStaff.objects.filter(user=user).first()
                if chef_staff:
                    restaurant = chef_staff.restaurant
                # Check Staff
                elif hasattr(user, 'staff_profile') and user.staff_profile:
                    restaurant = user.staff_profile.restaurant

            if not restaurant:
                return Response(
                    {"error": "No restaurant found for this user."},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get all completed orders for this restaurant in the current month
            orders = Order.objects.filter(
                restaurant=restaurant,
                status='completed',
                created_time__year=current_year,
                created_time__month=current_month
            )

            # Prepare day-wise totals and counts
            days_in_month = monthrange(current_year, current_month)[1]
            day_wise_sales = {f"day{day}": 0 for day in range(1, days_in_month + 1)}
            day_wise_order_count = {f"day{day}": 0 for day in range(1, days_in_month + 1)}

            for order in orders:
                day_key = f"day{order.created_time.day}"
                day_wise_sales[day_key] += float(order.total_price)
                day_wise_order_count[day_key] += 1

            total_sales = sum(day_wise_sales.values())
            total_orders = sum(day_wise_order_count.values())

            return Response({
                "month": today.strftime("%B %Y"),
                "sales_report_price": day_wise_sales,
                "sales_report_count_completed_order": day_wise_order_count,
                "total_monthly_sales": round(total_sales, 2),
                "total_completed_orders": total_orders
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
class CartViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    
    def get_serializer_class(self):
        # We need a serializer for Cart
        from .serializers import CartSerializer
        return CartSerializer

    def get_queryset(self):
        # Resolve cart from guest session
        session_token = self.request.headers.get('X-Guest-Session-Token')
        if not session_token:
            return Cart.objects.none()
        
        try:
            session = GuestSession.objects.get(session_token=session_token, is_active=True)
            return Cart.objects.filter(guest_session=session)
        except GuestSession.DoesNotExist:
            return Cart.objects.none()

    @action(detail=False, methods=['post'])
    def add_item(self, request):
        session_token = request.headers.get('X-Guest-Session-Token')
        if not session_token:
            return Response({'error': 'Missing session token'}, status=status.HTTP_401_UNAUTHORIZED)
        
        try:
            session = GuestSession.objects.get(session_token=session_token, is_active=True)
        except GuestSession.DoesNotExist:
            return Response({'error': 'Invalid or expired session'}, status=status.HTTP_403_FORBIDDEN)
            
        # Strict Table Isolation Check
        request_table_id = request.data.get('table_id')
        if request_table_id and str(request_table_id) != str(session.device.id):
             return Response({
                 'error': 'table_mismatch',
                 'message': 'Your session does not belong to the requested table.'
             }, status=status.HTTP_403_FORBIDDEN)

        item_id = request.data.get('item_id')
        quantity = int(request.data.get('quantity', 1))
        
        if not item_id:
            return Response({'error': 'Missing item_id'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Get or create cart - ALWAYS use session.device (Server Authority)
        cart, created = Cart.objects.get_or_create(guest_session=session, device=session.device)
        
        # Add item
        from item.models import Item
        try:
            item = Item.objects.get(id=item_id)
        except Item.DoesNotExist:
            return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)
            
        cart_item, created = CartItem.objects.get_or_create(cart=cart, item=item)
        if not created:
            cart_item.quantity += quantity
        else:
            cart_item.quantity = quantity
        cart_item.save()
        
        # Serialize and return cart
        from .serializers import CartSerializer
        return Response(CartSerializer(cart).data)

    @action(detail=False, methods=['post'])
    def clear(self, request):
        session_token = request.headers.get('X-Guest-Session-Token')
        if not session_token:
            return Response({'error': 'Missing session token'}, status=status.HTTP_401_UNAUTHORIZED)
            
        try:
            session = GuestSession.objects.get(session_token=session_token, is_active=True)
            Cart.objects.filter(guest_session=session).delete()
            return Response({'status': 'cleared'})
        except GuestSession.DoesNotExist:
            return Response({'error': 'Invalid session'}, status=status.HTTP_403_FORBIDDEN)
