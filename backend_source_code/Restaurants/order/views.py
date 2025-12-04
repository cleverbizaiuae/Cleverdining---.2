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
from accounts.permissions import IsCustomerRole,IsOwnerRole,IsChefOrStaff
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

    def perform_create(self, serializer):
        # Resolve guest session
        session_token = self.request.headers.get('X-Guest-Session-Token')
        if not session_token:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Missing session token. Please scan the QR code again.")

        try:
            session = GuestSession.objects.get(session_token=session_token, is_active=True)
        except GuestSession.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Invalid or expired session. Please scan the QR code again.")

        device = session.device
        restaurant = device.restaurant

        order = serializer.save(device=device, restaurant=restaurant, guest_session=session) 
        data = OrderDetailSerializer(order).data
        
        # Notify Restaurant
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{order.restaurant.id}",
            {
                "type": "order_created",
                "order": data
            }
        )
        
        # Notify Guest Session
        if order.guest_session:
            async_to_sync(channel_layer.group_send)(
                f"session_{order.guest_session.id}",
                {
                    "type": "order_status_update", # Reusing existing handler in OrderConsumer
                    "order_id": order.id,
                    "status": order.status,
                    "order": data # Sending full order data if needed
                }
            )
        
        # Clear cart after order
        Cart.objects.filter(guest_session=session).delete()




        

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
    permission_classes = [IsAuthenticated,IsOwnerRole]
    pagination_class = TenPerPagePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['id']

    def get_queryset(self):
        user = self.request.user
        return Order.objects.filter(restaurant__owner=user).order_by('-created_time')
    
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
    permission_classes = [IsAuthenticated,IsOwnerRole]

    def patch(self, request, pk):
        user = request.user
        try:
            order = Order.objects.get(pk=pk, restaurant__owner=user)
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
        # Get all restaurants where user is active staff/chef
        chef_staff_qs = ChefStaff.objects.filter(user=user)
        restaurant_id = chef_staff_qs.first().restaurant_id

        return Order.objects.filter(restaurant_id=restaurant_id).order_by('-created_time')
    

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
    permission_classes = [IsAuthenticated, IsOwnerRole]

    def get(self, request):
        user = request.user
        today = now().date()
        start_of_week = today - timedelta(days=today.weekday())  # Monday
        this_year = today.year
        last_year = this_year - 1

        restaurants = Restaurant.objects.filter(owner=user)

        # Get all orders for owner's restaurant
        orders = Order.objects.filter(restaurant__in=restaurants)

        # Filter completed orders
        completed_orders = orders.filter(status='completed')

        # ---- TODAY COMPLETED ORDER PRICE ----

        today_total_price = (
            completed_orders.filter(updated_time__date=today)
            .aggregate(total=Sum('total_price'))['total'] or 0
        )

        # ---- WEEKLY GROWTH (compare this week vs last week) ----
        last_week_start = start_of_week - timedelta(days=7)
        last_week_end = start_of_week - timedelta(days=1)

        this_week_total = (
            completed_orders.filter(updated_time__date__gte=start_of_week)
            .aggregate(total=Sum('total_price'))['total'] or 0
        )
        last_week_total = (
            completed_orders.filter(updated_time__date__range=[last_week_start, last_week_end])
            .aggregate(total=Sum('total_price'))['total'] or 0
        )

        weekly_growth = 0
        if last_week_total > 0:
            weekly_growth = ((this_week_total - last_week_total) / last_week_total) * 100

        # ---- Monthly Data for Current Year ----
        current_year_data = {month.lower()[:3]: 0 for month in month_name if month}
        last_year_data = {month.lower()[:3]: 0 for month in month_name if month}

        for order in completed_orders:
            month = order.updated_time.month
            year = order.updated_time.year

            if year == this_year:
                key = month_name[month].lower()[:3]
                current_year_data[key] += 1
            elif year == last_year:
                key = month_name[month].lower()[:3]
                last_year_data[key] += 1

        total_member = ChefStaff.objects.filter(restaurant__in=restaurants).count()

        return Response({
            "status": {
                "today_total_completed_order_price": str(today_total_price),
                "weekly_growth": round(weekly_growth, 2),
                "total_member": total_member,
                "current_year": this_year,
                "last_year": last_year

            },
            "current_year": current_year_data,
            "last_year": last_year_data
        })





class MonthlySalesReportView(APIView):
    """
    Returns the current month's day-wise completed sales report 
    (both total sales price and completed order count)
    for the restaurant owned by the logged-in user.
    """

    def get(self, request):
        try:
            # Get current month and year
            today = datetime.now()
            current_year = today.year
            current_month = today.month

            # Get the restaurant owned by this user
            restaurant = Restaurant.objects.filter(owner=request.user).first()
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
            
        item_id = request.data.get('item_id')
        quantity = int(request.data.get('quantity', 1))
        
        if not item_id:
            return Response({'error': 'Missing item_id'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Get or create cart
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
