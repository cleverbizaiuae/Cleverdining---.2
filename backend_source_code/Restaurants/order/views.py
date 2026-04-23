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
from django.db.models import Sum, Count, Q
from calendar import month_name
from restaurant.models import Restaurant
from accounts.models import ChefStaff
from asgiref.sync import async_to_sync
# date 
from datetime import date,timedelta
from django.db.models import Sum
from channels.layers import get_channel_layer
from .schema_guard import ensure_order_notes_column
channel_layer = get_channel_layer()
from message.models import ChatMessage
from datetime import datetime
from calendar import monthrange



class OrderCreateAPIView(generics.CreateAPIView):
    serializer_class = OrderCreateSerializerFixed
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        # Production safety: self-heal legacy DBs missing `order_order.notes`
        ensure_order_notes_column()
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
            # Resilient lookup: try active first, fall back to most recent
            session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
            if not session:
                from rest_framework.exceptions import ValidationError
                raise ValidationError("Invalid or expired session. Please scan the QR code again.")
        except Exception:
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
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{order.restaurant.id}",
                {
                    "type": "order_created",
                    "order": data
                }
            )
        except Exception as e:
            print(f"Error sending restaurant notification: {e}")
        
        if order.guest_session:
            try:
                async_to_sync(channel_layer.group_send)(
                    f"session_{order.guest_session.id}",
                    {
                        "type": "order_status_update", 
                        "order_id": order.id,
                        "status": order.status,
                        "order": data
                    }
                )
            except Exception as e:
                 print(f"Error sending guest notification: {e}")

            # CLEAR CART after successful order placement
            try:
                # Assuming One Cart per Session
                deleted_count, _ = Cart.objects.filter(guest_session=order.guest_session).delete()
                print(f"DEBUG_CART: Deleted {deleted_count} carts for session {order.guest_session.id}")
            except Exception as e:
                print(f"Error clearing cart: {e}")
        
        # Handle Cash Payment Logic
        payment_method = self.request.data.get('payment_method')
        if payment_method == 'cash':
            order.status = 'awaiting_cash'
            order.payment_status = 'pending_cash'
            order.save()
            # Broadcast Cash Alert to Restaurant (best-effort, don't crash if Redis is down)
            try:
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
            except Exception as e:
                print(f"[WS-NOTIFY] Failed to send cash_payment_alert: {e}")
            # Send updated status to guest
            if order.guest_session:
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"session_{order.guest_session.id}",
                        {
                            "type": "order_status_update",
                            "order_id": order.id,
                            "status": 'awaiting_cash',
                            "order": OrderDetailSerializer(order).data
                        }
                    )
                except Exception as e:
                    print(f"[WS-NOTIFY] Failed to send guest order_status_update: {e}")

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
        from payment.models import Payment
        import uuid

        try:
            # Verify permission (Owner/Staff of restaurant)
            if hasattr(request.user, 'role') and request.user.role == 'owner':
                order = Order.objects.get(pk=pk, restaurant__owner=request.user)
            else:
                order = Order.objects.get(pk=pk) # Permission class handles access
        except Order.DoesNotExist:
             return Response({"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        if order.payment_status == 'paid':
             return Response({"message": "Order is already paid"}, status=status.HTTP_200_OK)

        # Update Order (and all other session orders ONLY if they are also awaiting cash)
        orders_to_update = [order]
        
        if order.guest_session:
             # Auto-confirm ALL other unpaid orders for this session (Bulk Cash Payment)
             # This ensures that if the customer paid "Table 2" total, all orders for Table 2 are marked paid.
             session_orders = Order.objects.filter(
                 guest_session=order.guest_session,
                 # We should include 'pending', 'preparing', 'served' too, not just 'awaiting_cash',
                 # because often staff just takes cash without user clicking "Pay by Cash".
                 status__in=['pending', 'preparing', 'served', 'delivered', 'awaiting_cash']
             ).exclude(pk=order.pk).exclude(payment_status='paid')
             
             orders_to_update.extend(list(session_orders))
        
        for o in orders_to_update:
            o.status = 'completed'
            o.payment_status = 'paid'
            o.save()
            
            # CREATE PAYMENT RECORD
            payment_created = False
            payment_error = None
            try:
                from django.utils import timezone
                import logging
                logger = logging.getLogger(__name__)
                
                # Check if payment already exists for this order
                existing_payment = Payment.objects.filter(order=o).first()
                if existing_payment:
                    # Update existing payment status to completed
                    if existing_payment.status != 'completed':
                        existing_payment.status = 'completed'
                        existing_payment.confirmed_at = timezone.now()
                        existing_payment.save()
                        logger.info(f"Payment {existing_payment.id} updated to completed for order {o.id}")
                    else:
                        logger.info(f"Payment already completed for order {o.id}: {existing_payment.id}")
                    payment_created = True
                else:
                    payment = Payment.objects.create(
                        device=o.device,
                        restaurant=o.restaurant,
                        order=o,
                        amount=o.total_price,
                        provider='cash',
                        status='completed',
                        transaction_id=f"cash_{o.id}_{uuid.uuid4().hex[:8]}",
                        confirmed_at=timezone.now(),
                        created_by=f"staff:{request.user.id}"
                    )
                    payment_created = True
                    logger.info(f"Payment created successfully for order {o.id}: payment_id={payment.id}")
            except Exception as e:
                import traceback
                payment_error = str(e)
                print(f"CRITICAL ERROR creating payment record for order {o.id}: {e}")
                print(traceback.format_exc())

            # Notify Restaurant (best-effort, don't crash if Redis is down)
            data = OrderDetailSerializer(o).data
            try:
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{o.restaurant.id}",
                    {
                        "type": "order_paid",
                        "order": data
                    }
                )
            except Exception as e:
                print(f"[WS-NOTIFY] Failed to send order_paid for order {o.id}: {e}")
            # Remove Alert
            try:
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{o.restaurant.id}",
                    {
                        "type": "cash_payment_confirmed",
                        "order_id": o.id
                    }
                )
            except Exception as e:
                print(f"[WS-NOTIFY] Failed to send cash_payment_confirmed for order {o.id}: {e}")

        # Check if session should end (Are there any OTHER unpaid orders?)
        if order.guest_session:
            session = order.guest_session
            remaining_unpaid = Order.objects.filter(
                guest_session=session,
                status__in=['pending', 'preparing', 'served', 'awaiting_cash']
            ).exclude(payment_status='paid').exists()
            
            if not remaining_unpaid:
                session.is_active = False
                session.save()

                # Clear chat messages for this device so next guest gets a clean slate
                try:
                    ChatMessage.objects.filter(device=order.device).delete()
                    print(f"[SESSION-END] Cleared chat messages for device {order.device_id}")
                except Exception as e:
                    print(f"[SESSION-END] Failed to clear chat messages: {e}")

                # Notify dashboard chat clients to clear this table thread immediately
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_{order.restaurant.id}",
                        {
                            "type": "chat_cleared",
                            "device_id": order.device_id,
                            "session_id": session.id,
                            "reason": "bill_paid"
                        }
                    )
                except Exception as e:
                    print(f"[WS-NOTIFY] Failed to send chat_cleared to restaurant group: {e}")

                try:
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_chat_{order.restaurant.id}",
                        {
                            "type": "chat_cleared",
                            "device_id": order.device_id,
                            "session_id": session.id,
                            "reason": "bill_paid"
                        }
                    )
                except Exception as e:
                    print(f"[WS-NOTIFY] Failed to send chat_cleared to chat group: {e}")

                try:
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_{order.restaurant.id}",
                        {
                            "type": "session_closed",
                            "session_id": session.id,
                            "table_id": order.device_id,
                            "reason": "bill_paid"
                        }
                    )
                except Exception as e:
                    print(f"[WS-NOTIFY] Failed to send session_closed to restaurant group: {e}")
                
                # Notify Guest (best-effort)
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"session_{order.guest_session.id}",
                        {
                            "type": "order_status_update",
                            "order_id": order.id,
                            "status": 'paid', 
                            "session_ended": True
                        }
                    )
                except Exception as e:
                    print(f"[WS-NOTIFY] Failed to send session_ended: {e}")
            else:
                 # Just notify status update without ending session
                 try:
                     async_to_sync(channel_layer.group_send)(
                        f"session_{order.guest_session.id}",
                        {
                            "type": "order_status_update",
                            "order_id": order.id,
                            "status": 'paid', 
                            "session_ended": False
                        }
                    )
                 except Exception as e:
                     print(f"[WS-NOTIFY] Failed to send order_status_update: {e}")

        return Response({"message": "Cash payment confirmed."})




        

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
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{order.restaurant.id}",
                {
                    "type": "order_updated",
                    "order": data
                }
            )
        except Exception as e:
            print(f"[WS-NOTIFY] Failed to send order_updated (cancel): {e}")
        return Response({"message": "Order cancelled successfully"})
    



class MyOrdersAPIView(generics.ListAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = TenPerPagePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['id', 'device__table_name']

    def get_queryset(self):
        ensure_order_notes_column()
        user = self.request.user
        # Optimized: Use select_related and prefetch_related to avoid N+1 queries
        base_qs = Order.objects.select_related(
            'device', 'restaurant', 'guest_session'
        ).prefetch_related(
            'order_items__item', 'payments'
        )
        
        if user.is_authenticated:
            return base_qs.filter(
                device__user=user,
                status__in=['pending', 'preparing', 'served', 'delivered', 'awaiting_cash']
            ).exclude(
                payment_status__in=['paid', 'completed']
            ).order_by('-created_time')
        else:
            # Try to resolve guest session
            session_token = self.request.headers.get('X-Guest-Session-Token')
            if session_token:
                # Resilient lookup: try active first, fall back to most recent
                session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
                if session:
                    return base_qs.filter(
                        guest_session=session,
                        status__in=['pending', 'preparing', 'served', 'delivered', 'awaiting_cash']
                    ).exclude(
                        payment_status='paid'
                    ).order_by('-created_time')
                return Order.objects.none()

            # Fallback to device_id REMOVED for security/isolation. 
            # Orders must be accessed via Session Token or User Auth.
            return Order.objects.none()




class MySingleOrderAPIView(generics.RetrieveAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = 'pk' 

    def get_queryset(self):
        ensure_order_notes_column()
        user = self.request.user
        if user.is_authenticated:
            return Order.objects.filter(
                device__user=self.request.user
            )

        # Guest Session Logic
        session_token = self.request.headers.get('X-Guest-Session-Token')
        if session_token:
            # Resilient lookup: try active first, fall back to most recent
            session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
            if session:
                return Order.objects.filter(
                    guest_session=session
                )
            return Order.objects.none()
        
        return Order.objects.none()




class OwnerRestaurantOrdersAPIView(generics.ListAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [IsAuthenticated,IsOwnerChefOrStaff]
    pagination_class = TenPerPagePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['id', 'device__table_name']

    def get_queryset(self):
        ensure_order_notes_column()
        try:
            user = self.request.user
            
            # Optimized: Use select_related and prefetch_related to avoid N+1 queries
            base_qs = Order.objects.select_related(
                'device', 'restaurant', 'guest_session', 'business_day'
            ).prefetch_related(
                'order_items__item', 'payments'
            )
            
            role = getattr(user, 'role', None)
            
            if role == 'owner':
                queryset = base_qs.filter(restaurant__owner=user)
            elif role in ['manager', 'staff', 'chef']:
                restaurant_ids = ChefStaff.objects.filter(
                    user=user, 
                    action='accepted'
                ).values_list('restaurant_id', flat=True)
                queryset = base_qs.filter(restaurant_id__in=restaurant_ids)
            else:
                queryset = Order.objects.none()
            
            # BUSINESS DAY FILTER: Show only orders for the active business day(s)
            # If there's an active business day, filter to it; otherwise show all orders
            from restaurant.models import BusinessDay
            active_days = BusinessDay.objects.filter(
                restaurant__in=queryset.values_list('restaurant', flat=True).distinct(),
                is_active=True
            )
            if active_days.exists():
                return queryset.filter(business_day__in=active_days).order_by('-created_time')
            else:
                # No active business day — show all orders (don't hide everything)
                return queryset.order_by('-created_time')
        except Exception as e:
            print(f"OwnerRestaurantOrdersAPIView.get_queryset error: {e}")
            import traceback
            traceback.print_exc()
            return Order.objects.none()
    
    def list(self, request, *args, **kwargs):
        try:
            queryset = self.filter_queryset(self.get_queryset())  # ✅ apply search filtering

            page = self.paginate_queryset(queryset)
            serializer = self.get_serializer(page, many=True)

            # Stats should be calculated on the FULL (unfiltered) queryset
            full_queryset = self.get_queryset()
            today = date.today()
            completed_statuses = ['completed', 'delivered']
            completed_orders = full_queryset.filter(status__in=completed_statuses)
            completed_today = completed_orders.filter(updated_time__date=today)
            ongoing_statuses = ['pending', 'preparing', 'served', 'awaiting_cash']

            stats = {
                "total_completed_orders": completed_orders.count(),
                "today_completed_order_count": completed_today.count(),
                "ongoing_orders": full_queryset.filter(status__in=ongoing_statuses).count()
            }

            return self.get_paginated_response({
                "stats": stats,
                "orders": serializer.data
            })
        except Exception as e:
            print(f"OwnerRestaurantOrdersAPIView.list error: {e}")
            import traceback
            traceback.print_exc()
            # Return empty response to prevent UI crash
            return Response({
                "count": 0,
                "next": None,
                "previous": None,
                "results": {
                    "stats": {
                        "total_completed_orders": 0,
                        "today_completed_order_count": 0,
                        "ongoing_orders": 0
                    },
                    "orders": []
                }
            })
    



class OwnerUpdateOrderStatusAPIView(APIView):
    permission_classes = [IsAuthenticated,IsOwnerChefOrStaff]

    def patch(self, request, pk):
        user = request.user
        try:
            if getattr(user, 'role', None) == 'owner':
                order = Order.objects.get(pk=pk, restaurant__owner=user)
            elif getattr(user, 'role', None) in ['manager', 'staff', 'chef']:
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


        
        # Allow cancelling a completed order (Voiding)
        if order.status == "completed" and new_status == "cancelled":
             pass # Allow passing through to update
        
        # Allow re-marking as completed (Idempotent - checks payment/messages again)
        elif order.status == "completed" and new_status == "completed":
             pass 
             
        elif order.status == "completed":
            return Response({"error": "Order is already completed/delivered."}, status=status.HTTP_400_BAD_REQUEST)

        order.status = new_status
        order.save(update_fields=['status', 'updated_time'])

        import sys
        cl_backend = type(channel_layer).__name__
        print(f"[ORDER-EMIT] Status changed | order={order.id} → {order.status} | device_id={order.device_id} | session_id={order.guest_session_id} | channel_layer={cl_backend}", file=sys.stderr)

        if order.status == "completed":
            ChatMessage.objects.filter(
                device=order.device,
                new_message=True
            ).update(new_message=False)

        print(f"[ORDER-EMIT] Sending to group: device_{order.device_id} | type=order_status_update", file=sys.stderr)
        try:
            async_to_sync(channel_layer.group_send)(
                f'device_{order.device_id}',
                {
                    'type': 'order_status_update',
                    'status': order.status,
                    'order_id': order.id,
                }
            )
        except Exception as e:
            print(f"[WS-NOTIFY] Failed to send order_status_update to device: {e}", file=sys.stderr)

        # Also broadcast to session group for redundancy
        if order.guest_session_id:
            print(f"[ORDER-EMIT] Sending to group: session_{order.guest_session_id} | type=order_status_update", file=sys.stderr)
            try:
                async_to_sync(channel_layer.group_send)(
                    f'session_{order.guest_session_id}',
                    {
                        'type': 'order_status_update',
                        'status': order.status,
                        'order_id': order.id,
                    }
                )
            except Exception as e:
                print(f"[WS-NOTIFY] Failed to send order_status_update to session: {e}", file=sys.stderr)

        data = OrderDetailSerializer(order).data
        print(f"[ORDER-EMIT] Sending to group: restaurant_{order.restaurant.id} | type=order_updated", file=sys.stderr)
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{order.restaurant.id}",
                {
                    "type": "order_updated",
                    "order": data
                }
            )
        except Exception as e:
            print(f"[WS-NOTIFY] Failed to send order_updated to restaurant: {e}", file=sys.stderr)
        
        return Response({"message": "Order status updated", "status": order.status})
    


class OwnerOrderDetailAPIView(generics.RetrieveAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [IsAuthenticated, IsOwnerChefOrStaff]
    lookup_field = 'pk'

    def get_queryset(self):
        ensure_order_notes_column()
        user = self.request.user
        base_qs = Order.objects.select_related(
            'device', 'restaurant', 'guest_session', 'business_day'
        ).prefetch_related(
            'order_items__item', 'payments'
        )
        
        if getattr(user, 'role', None) == 'owner':
             return base_qs.filter(restaurant__owner=user)
        elif getattr(user, 'role', None) in ['manager', 'staff', 'chef']:
             restaurant_ids = ChefStaff.objects.filter(
                user=user, 
                action='accepted'
             ).values_list('restaurant_id', flat=True)
             return base_qs.filter(restaurant_id__in=restaurant_ids)
        
        return Order.objects.none()
    



class ChefStaffOrdersAPIView(generics.ListAPIView):
    serializer_class = OrderDetailSerializer
    permission_classes = [IsAuthenticated,IsOwnerChefOrStaff]
    pagination_class = TenPerPagePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['id', 'device__table_name']

    def get_queryset(self):
        ensure_order_notes_column()
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
        ongoing_statuses = ['pending', 'preparing', 'served', 'awaiting_cash']
        completed_statuses = ['completed', 'delivered']
        today = date.today()
        total_ongoing = full_queryset.filter(status__in=ongoing_statuses).count()
        total_completed = full_queryset.filter(status__in=completed_statuses).count()
        today_completed = full_queryset.filter(status__in=completed_statuses, updated_time__date=today).count()

        stats = {
            "total_ongoing_orders": total_ongoing,
            "total_completed_orders": total_completed,
            "today_completed_order_count": today_completed,
            "ongoing_orders": total_ongoing,
        }

        return self.get_paginated_response({
            "stats": stats,
            "orders": serializer.data
        })
    

    

class ChefStaffUpdateOrderStatusAPIView(APIView):
    permission_classes = [IsAuthenticated,IsOwnerChefOrStaff]

    def patch(self, request, pk):
        user = request.user
        new_status = request.data.get('status')

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        is_chef = ChefStaff.objects.filter(user=user, restaurant=order.restaurant, action='accepted').exists()
        if not is_chef:
            return Response({"detail": "You are not authorized to update this order."}, status=status.HTTP_403_FORBIDDEN)


        
        if order.status == "completed":
            return Response({"detail": "Order already completed"}, status=status.HTTP_400_BAD_REQUEST)

        order.status = new_status
        order.save(update_fields=['status', 'updated_time'])

        if order.status == "completed":
            ChatMessage.objects.filter(
                device=order.device,
                new_message=True
            ).update(new_message=False)

        import sys
        print(f"[ORDER-EMIT-CHEF] Status changed | order={order.id} → {order.status} | device_id={order.device_id} | session_id={order.guest_session_id}", file=sys.stderr)

        print(f"[ORDER-EMIT-CHEF] Sending to group: device_{order.device_id} | type=order_status_update", file=sys.stderr)
        try:
            async_to_sync(channel_layer.group_send)(
                f'device_{order.device_id}',
                {
                    'type': 'order_status_update',
                    'status': order.status,
                    'order_id': order.id,
                }
            )
        except Exception as e:
            print(f"[WS-NOTIFY] Failed to send chef order_status_update to device: {e}", file=sys.stderr)

        # Also broadcast to session group for redundancy
        if order.guest_session_id:
            print(f"[ORDER-EMIT-CHEF] Sending to group: session_{order.guest_session_id} | type=order_status_update", file=sys.stderr)
            try:
                async_to_sync(channel_layer.group_send)(
                    f'session_{order.guest_session_id}',
                    {
                        'type': 'order_status_update',
                        'status': order.status,
                        'order_id': order.id,
                    }
                )
            except Exception as e:
                print(f"[WS-NOTIFY] Failed to send chef order_status_update to session: {e}", file=sys.stderr)

        data = OrderDetailSerializer(order).data
        print(f"[ORDER-EMIT-CHEF] Sending to group: restaurant_{order.restaurant.id} | type=order_updated", file=sys.stderr)
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{order.restaurant.id}",
                {
                    "type": "order_updated",
                    "order": data
                }
            )
        except Exception as e:
            print(f"[WS-NOTIFY] Failed to send chef order_updated to restaurant: {e}", file=sys.stderr)

        return Response({"detail": f"Order status updated to {new_status}"}, status=status.HTTP_200_OK)
    



class OrderAnalyticsAPIView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerChefOrStaff]

    def get(self, request):
        import traceback
        try:
            user = request.user
            restaurant_ids = []
            
            # --- IDENTIFY RESTAURANTS ---
            # 1. Direct Owner Check
            try:
                if getattr(user, 'role', '') == 'owner':
                    restaurant_ids = list(Restaurant.objects.filter(owner=user).values_list('id', flat=True))
                # 2. Staff/Manager check
                elif getattr(user, 'role', '') in ['manager', 'staff', 'chef']:
                    chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
                    if chef_staff:
                        restaurant_ids = [chef_staff.restaurant_id]
                    elif hasattr(user, 'staff_profile') and user.staff_profile:
                        restaurant_ids = [user.staff_profile.restaurant_id]
            except Exception as e:
                print(f"Error identifying user restaurants: {e}")

            if not restaurant_ids:
                  return Response({"status": {}, "chart_data": {}})

            # --- PARSE PARAMETERS ---
            time_range = request.query_params.get('time_range', 'year') # today, week, month, year
            compare = request.query_params.get('compare', 'true') == 'true'

            from django.utils import timezone
            from django.db.models import Sum, Count, F
            from django.db.models.functions import TruncHour, TruncDay, TruncMonth
            
            now_dt = timezone.now()
            
            # 1. Determine Date Ranges
            start_date = now_dt
            trunc_func = TruncMonth
            date_format = "%b" # Month name

            if time_range == 'year':
                start_date = now_dt.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                trunc_func = TruncMonth
                date_format = "%b"
            elif time_range == 'month':
                start_date = now_dt - timedelta(days=30)
                trunc_func = TruncDay
                date_format = "%d %b"
            elif time_range == 'week':
                start_date = now_dt - timedelta(days=7)
                trunc_func = TruncDay
                date_format = "%d %b"
            elif time_range == 'today' or time_range == 'day':
                start_date = now_dt.replace(hour=0, minute=0, second=0, microsecond=0)
                trunc_func = TruncHour
                date_format = "%H:00"

            # 2. Comparison Date Range
            comp_start = None
            comp_end = None
            if compare:
                duration = now_dt - start_date
                comp_end = start_date
                comp_start = start_date - duration

            # --- OPTIMIZED DATA FETCHING (Single Query) ---
            def get_aggregated_data(s_date, e_date, t_func):
                # Filter Base Query
                qs = Order.objects.filter(
                    restaurant_id__in=restaurant_ids,
                    created_time__range=[s_date, e_date]
                ).filter(Q(status='completed') | Q(payment_status='paid'))

                # Aggregate by Time Unit
                aggregated = (
                    qs.annotate(period=t_func('created_time'))
                    .values('period')
                    .annotate(revenue=Sum('total_price'), count=Count('id'))
                    .order_by('period')
                )
                return aggregated

            # Main Data
            main_agg = get_aggregated_data(start_date, now_dt, trunc_func)
            
            # Comparison Data
            comp_agg = []
            if compare and comp_start:
                 comp_agg = get_aggregated_data(comp_start, comp_end, trunc_func)

            # --- FORMATTING RESPONSE ---
            # We need to fill in missing periods if we want a perfect graph, 
            # OR we just send the data points we have. 
            # For simplicity/speed, we'll map the aggregated results to arrays.
            
            labels = []
            revenue_data = []
            orders_count_data = []
            
            # Helper to format data
            for entry in main_agg:
                labels.append(entry['period'].strftime(date_format))
                revenue_data.append(float(entry['revenue'] or 0))
                orders_count_data.append(entry['count'])

            comp_revenue = [float(x['revenue'] or 0) for x in comp_agg]
            comp_orders = [x['count'] for x in comp_agg]


            # --- METRIC CARDS (Optimized) ---
            # Calculate Totals from the Aggregated Data (Avoids extra queries if range covers it)
            # Actually for 'total_revenue' we want the sum of the range.
            total_revenue = sum(revenue_data)
            total_orders_count = sum(orders_count_data)

            # Weekly Growth (Compare this week vs last week - Standard Metric)
            # We can run 2 quick queries for this specific metric or cache it.
            # Let's run it standardly as it's small.
            start_week = now_dt.date() - timedelta(days=now_dt.weekday())
            this_week_rev = Order.objects.filter(
                restaurant_id__in=restaurant_ids, 
                created_time__date__gte=start_week
            ).filter(Q(status='completed') | Q(payment_status='paid')).aggregate(s=Sum('total_price'))['s'] or 0
            
            last_week_start = start_week - timedelta(days=7)
            last_week_end = start_week - timedelta(days=1)
            last_week_rev = Order.objects.filter(
                restaurant_id__in=restaurant_ids, 
                created_time__date__range=[last_week_start, last_week_end]
            ).filter(Q(status='completed') | Q(payment_status='paid')).aggregate(s=Sum('total_price'))['s'] or 0
            
            growth = 0
            if last_week_rev > 0:
                growth = ((this_week_rev - last_week_rev) / last_week_rev) * 100

            # Active staff count
            active_staff = ChefStaff.objects.filter(restaurant_id__in=restaurant_ids, action='accepted').count()
            
            return Response({
                "status": {
                    "total_revenue": total_revenue, 
                    "total_orders": total_orders_count,
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
                created_time__year=current_year,
                created_time__month=current_month
            ).filter(Q(status='completed') | Q(payment_status='paid'))

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
        
        # Resilient lookup: try active first, fall back to most recent
        session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
        if session:
            return Cart.objects.filter(guest_session=session)
        return Cart.objects.none()

    @action(detail=False, methods=['post'])
    def add_item(self, request):
        session_token = request.headers.get('X-Guest-Session-Token')
        if not session_token:
            return Response({'error': 'Missing session token'}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Resilient lookup: try active first, fall back to most recent
        session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
        if not session:
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
            
        # Resilient lookup: try active first, fall back to most recent
        session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
        if not session:
            return Response({'error': 'Invalid session'}, status=status.HTTP_403_FORBIDDEN)
        Cart.objects.filter(guest_session=session).delete()
        return Response({'status': 'cleared'})

    @action(detail=False, methods=['get'])
    def upsell_suggestions(self, request):
        session_token = request.headers.get('X-Guest-Session-Token')
        if not session_token:
            return Response({'error': 'Missing session token'}, status=status.HTTP_401_UNAUTHORIZED)

        session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
        if not session:
            return Response({'error': 'Invalid session'}, status=status.HTTP_403_FORBIDDEN)

        cart = (
            Cart.objects
            .filter(guest_session=session, device=session.device)
            .order_by('-updated_at')
            .first()
        )

        if not cart:
            return Response({'cart_id': None, 'suggestions': []})

        try:
            limit = int(request.query_params.get('limit', 4))
        except (TypeError, ValueError):
            limit = 4

        from .upsell import build_cart_upsell_suggestions
        from item.serializers import ItemSerializer

        trigger_point = request.query_params.get('trigger_point', 'cart')
        try:
            source_item_id = int(request.query_params.get('source_item_id')) if request.query_params.get('source_item_id') else None
        except (TypeError, ValueError):
            source_item_id = None

        # Compact signal transport over query params:
        # category_views=1:2,5:1
        # category_declines=3:2
        # removed_categories=4,7
        def _parse_id_counts(raw_value):
            parsed = {}
            if not raw_value:
                return parsed
            for chunk in str(raw_value).split(','):
                value = chunk.strip()
                if not value:
                    continue
                if ':' in value:
                    category_id_raw, count_raw = value.split(':', 1)
                    try:
                        parsed[int(category_id_raw)] = int(count_raw)
                    except (TypeError, ValueError):
                        continue
                else:
                    try:
                        parsed[int(value)] = 1
                    except (TypeError, ValueError):
                        continue
            return parsed

        def _parse_id_list(raw_value):
            values = []
            if not raw_value:
                return values
            for chunk in str(raw_value).split(','):
                value = chunk.strip()
                if not value:
                    continue
                try:
                    values.append(int(value))
                except (TypeError, ValueError):
                    continue
            return values

        session_signals = {
            'category_views': _parse_id_counts(request.query_params.get('category_views')),
            'category_declines': _parse_id_counts(request.query_params.get('category_declines')),
            'recently_removed_category_ids': _parse_id_list(request.query_params.get('removed_categories')),
        }

        raw_suggestions = build_cart_upsell_suggestions(
            cart,
            limit=limit,
            trigger_point=trigger_point,
            source_item_id=source_item_id,
            session_signals=session_signals,
        )
        if not raw_suggestions:
            return Response({'cart_id': cart.id, 'suggestions': []})

        item_serializer = ItemSerializer(
            [entry['item'] for entry in raw_suggestions],
            many=True,
            context={'request': request},
        )

        suggestions = []
        for item_data, meta in zip(item_serializer.data, raw_suggestions):
            suggestions.append({
                **item_data,
                'upsell_rule': meta['rule'],
                'upsell_message': meta['message'],
                'upsell_score': meta['score'],
                'upsell_stage': meta.get('stage'),
            })

        return Response({
            'cart_id': cart.id,
            'suggestions': suggestions,
        })
