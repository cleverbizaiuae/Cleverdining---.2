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
from accounts.permissions import IsCustomerRole,IsOwnerRole,IsChefOrStaff,IsOwnerChefOrStaff,IsOwnerORStaff
from accounts.models import ChefStaff
from django.utils.timezone import now
from django.db.models import Sum, Count, Q
from calendar import month_name
from restaurant.models import BrandConfig, Restaurant
from accounts.models import ChefStaff
from asgiref.sync import async_to_sync
# date 
from datetime import date,timedelta
from django.db.models import Sum
from channels.layers import get_channel_layer
from .schema_guard import ensure_order_notes_column
from payment.schema_guard import ensure_payment_schema
from decimal import Decimal
channel_layer = get_channel_layer()
from message.models import ChatMessage
from datetime import datetime
from calendar import monthrange


def _order_payment_totals(order):
    total = Decimal(str(order.total_price or 0)).quantize(Decimal("0.01"))
    paid = Decimal(str(getattr(order, "amount_paid", 0) or 0)).quantize(Decimal("0.01"))
    try:
        bill = order.bill
    except Exception:
        bill = None

    if bill is not None:
        paid = max(paid, Decimal(str(bill.paid_amount or 0)).quantize(Decimal("0.01")))
    else:
        try:
            from payment.models import Payment
            paid = Payment.objects.filter(
                order=order,
                status__in=["completed", "paid", "succeeded", "success"],
            ).aggregate(total=Sum("amount")).get("total") or Decimal("0.00")
            paid = Decimal(str(paid)).quantize(Decimal("0.01"))
        except Exception:
            paid = Decimal("0.00")

    if str(order.payment_status or "").lower() in {"paid", "completed", "succeeded", "success"}:
        paid = max(paid, total)

    paid = min(max(paid, Decimal("0.00")), total)
    remaining = max(total - paid, Decimal("0.00")).quantize(Decimal("0.01"))
    return total, paid, remaining


def _block_unpaid_completion(order, new_status):
    if str(new_status or "").lower() not in {"completed", "paid", "delivered"}:
        return None
    total, paid, remaining = _order_payment_totals(order)
    if remaining > Decimal("0.001"):
        return Response(
            {
                "error": "Cannot complete order before the bill is fully paid.",
                "total": str(total),
                "amount_paid": str(paid),
                "remaining": str(remaining),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def _block_unpaid_kitchen_release(order, new_status):
    """Keep prepayment orders out of every kitchen status transition."""
    if (
        order.status == "awaiting_payment"
        and str(order.payment_status or "").lower() not in {"paid", "completed", "succeeded", "success"}
        and str(new_status or "").lower() not in {"awaiting_payment", "cancelled"}
    ):
        return Response(
            {
                "error": "This order must be paid before it can be released to the kitchen.",
                "status": order.status,
                "payment_status": order.payment_status,
            },
            status=status.HTTP_409_CONFLICT,
        )
    return None


def _cancel_pending_payments(order):
    """Retire pending payment attempts when their order is cancelled."""
    from payment.models import Payment
    from payment.split_bill import mark_payment_failed

    pending_payments = list(Payment.objects.filter(order=order, status="pending"))
    cancelled_at = now()
    for payment in pending_payments:
        payment.status = "cancelled"
        payment.cancelled_at = cancelled_at
        payment.cancel_reason = "Order cancelled"
        payment.save(
            update_fields=[
                "status",
                "cancelled_at",
                "cancel_reason",
                "updated_at",
            ]
        )
        mark_payment_failed(payment)

    if order.payment_status == "pending_cash":
        order.payment_status = "unpaid"



class OrderCreateAPIView(generics.CreateAPIView):
    serializer_class = OrderCreateSerializerFixed
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        # Production safety: self-heal legacy DBs missing `order_order.notes`
        ensure_order_notes_column()
        ensure_payment_schema()
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

        payment_method = str(self.request.data.get('payment_method') or 'card').strip().lower()
        try:
            pay_before_order = bool(restaurant.brand_config.pay_before_order)
        except BrandConfig.DoesNotExist:
            pay_before_order = False

        # Every pay-before order stays outside the kitchen until the selected
        # payment method is actually confirmed, including cash.
        requires_payment_before_release = pay_before_order
        if requires_payment_before_release:
            order.status = 'awaiting_payment'
            order.save(update_fields=['status', 'updated_time'])

        if payment_method == 'cash':
            from payment.services import PaymentService

            PaymentService.create_payment(
                order=order,
                success_url='',
                cancel_url='',
                provider='cash',
                amount=order.total_price,
                created_by='pre_order',
            )
            order.refresh_from_db()
        
        # Serialize Response
        headers = self.get_success_headers(serializer.data)
        data = OrderDetailSerializer(order).data
        
        # Do not send unpaid pre-orders to the kitchen. Payment verification
        # emits the order update after moving the order to pending.
        if not requires_payment_before_release:
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
        
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        pass # Deprecated by custom create() above


class ConfirmCashPaymentAPIView(APIView):
    """
    Endpoint for Staff/Owner to confirm cash receipt.
    Completes the order and Ends the Session.
    """
    permission_classes = [IsAuthenticated, IsOwnerORStaff]

    def patch(self, request, pk):
        from payment.models import Payment
        from payment.services import PaymentService, settle_bulk_split_payment
        from payment.split_bill import apply_successful_payment
        from django.utils import timezone
        import uuid
        ensure_payment_schema()

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

        was_awaiting_payment = order.status == 'awaiting_payment'
        pending_cash_payment = Payment.objects.filter(
            order=order,
            provider='cash',
            status='pending',
        ).order_by('-created_at').first()

        if pending_cash_payment:
            pending_cash_payment.status = 'completed'
            pending_cash_payment.confirmed_at = timezone.now()
            pending_cash_payment.save(update_fields=['status', 'confirmed_at', 'updated_at'])

            if pending_cash_payment.created_by and pending_cash_payment.created_by.startswith('guest_bulk_evenly'):
                settlement = settle_bulk_split_payment(pending_cash_payment)
                if settlement['fully_paid']:
                    PaymentService._close_session_and_clear_chat_if_settled(order)
                order.refresh_from_db()
                return Response({
                    'message': 'Cash share confirmed.',
                    'payment_status': order.payment_status,
                    'paid_amount': str(settlement['paid_amount']),
                    'remaining_amount': str(settlement['remaining_amount']),
                    'fully_paid': settlement['fully_paid'],
                })

            if pending_cash_payment.bill_id:
                bill = apply_successful_payment(pending_cash_payment)
                if bill.payment_status == 'fully_paid':
                    PaymentService._close_session_and_clear_chat_if_settled(order)
                order.refresh_from_db()
                data = OrderDetailSerializer(order).data
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_{order.restaurant.id}",
                        {
                            "type": "order_paid",
                            "order": data,
                        }
                    )
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_{order.restaurant.id}",
                        {
                            "type": "cash_payment_confirmed",
                            "order_id": order.id,
                        }
                    )
                except Exception as e:
                    print(f"[WS-NOTIFY] Failed to send confirmed cash update for order {order.id}: {e}")
                return Response({
                    'message': 'Cash payment confirmed.',
                    'payment_status': order.payment_status,
                    'status': order.status,
                    'paid_amount': str(bill.paid_amount),
                    'remaining_amount': str(bill.remaining_amount),
                    'fully_paid': bill.payment_status == 'fully_paid',
                })

        # Legacy full-order cash confirmation. Confirm only the selected order;
        # the table-level action explicitly calls this endpoint for every order.
        orders_to_update = [order]
        
        for o in orders_to_update:
            o.status = 'pending' if was_awaiting_payment else 'delivered'
            o.amount_paid = o.total_price
            o.payment_status = 'paid'
            o.save(update_fields=['status', 'amount_paid', 'payment_status', 'updated_time'])
            
            # CREATE PAYMENT RECORD
            payment_created = False
            payment_error = None
            try:
                from django.utils import timezone
                import logging
                logger = logging.getLogger(__name__)
                
                # Check if payment already exists for this order
                existing_payment = (
                    Payment.objects.filter(order=o, provider='cash')
                    .order_by('-created_at')
                    .first()
                )
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

                Cart.objects.filter(guest_session=session).delete()

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
                            "payment_status": 'paid',
                            "payment_method": 'cash',
                            "session_ended": True,
                            "session_id": session.id,
                            "device_id": order.device_id,
                            "restaurant_id": order.restaurant_id,
                            "reason": "bill_paid"
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
                            "payment_status": 'paid',
                            "payment_method": 'cash',
                            "session_ended": False,
                            "session_id": order.guest_session.id,
                            "device_id": order.device_id,
                            "restaurant_id": order.restaurant_id
                        }
                    )
                 except Exception as e:
                     print(f"[WS-NOTIFY] Failed to send order_status_update: {e}")

        return Response({"message": "Cash payment confirmed."})




        

class OrderCancelAPIView(APIView):
    permission_classes = [IsAuthenticated,IsCustomerRole]

    def patch(self, request, pk):
        ensure_payment_schema()
        try:
            order = Order.objects.get(pk=pk, device__user=request.user)
        except Order.DoesNotExist:
            return Response({"error": "Order not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

        if order.status != 'pending':
            return Response({"error": "Only pending orders can be cancelled"}, status=status.HTTP_400_BAD_REQUEST)

        order.status = 'cancelled'
        _cancel_pending_payments(order)
        order.save(update_fields=['status', 'payment_status', 'updated_time'])
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
        ensure_payment_schema()
        user = self.request.user
        # Optimized: Use select_related and prefetch_related to avoid N+1 queries
        base_qs = Order.objects.select_related(
            'device', 'restaurant', 'guest_session', 'bill'
        ).prefetch_related(
            'order_items__item', 'payments'
        )
        
        if user.is_authenticated:
            return base_qs.filter(
                device__user=user,
                status__in=['awaiting_payment', 'pending', 'preparing', 'served', 'delivered', 'awaiting_cash']
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
                    queryset = base_qs.filter(
                        guest_session=session,
                        status__in=['awaiting_payment', 'pending', 'preparing', 'served', 'delivered', 'completed', 'awaiting_cash']
                    )
                    include_settled = str(self.request.query_params.get('include_settled', '')).lower() in {
                        '1', 'true', 'yes'
                    }
                    if not include_settled:
                        queryset = queryset.exclude(payment_status='paid')
                    return queryset.order_by('-created_time')
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
        ensure_payment_schema()
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
        ensure_payment_schema()
        try:
            user = self.request.user
            
            # Optimized: Use select_related and prefetch_related to avoid N+1 queries
            base_qs = Order.objects.select_related(
                'device', 'restaurant', 'guest_session', 'business_day', 'bill'
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
                return queryset.filter(business_day__in=active_days).exclude(status='awaiting_payment').order_by('-created_time')
            else:
                # No active business day — show all orders (don't hide everything)
                return queryset.exclude(status='awaiting_payment').order_by('-created_time')
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
        ensure_payment_schema()
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

        completion_block = _block_unpaid_completion(order, new_status)
        if completion_block is not None:
            return completion_block
        release_block = _block_unpaid_kitchen_release(order, new_status)
        if release_block is not None:
            return release_block


        
        # Allow cancelling a completed order (Voiding)
        if order.status == "completed" and new_status == "cancelled":
             pass # Allow passing through to update
        
        # Allow re-marking as completed (Idempotent - checks payment/messages again)
        elif order.status == "completed" and new_status == "completed":
             pass 
             
        elif order.status == "completed":
            return Response({"error": "Order is already completed/delivered."}, status=status.HTTP_400_BAD_REQUEST)

        order.status = new_status
        if new_status == "cancelled":
            _cancel_pending_payments(order)
        order.save(update_fields=['status', 'payment_status', 'updated_time'])

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
        ensure_payment_schema()
        user = self.request.user
        base_qs = Order.objects.select_related(
            'device', 'restaurant', 'guest_session', 'business_day', 'bill'
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
        ensure_payment_schema()
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
             queryset = (
                Order.objects
                .filter(restaurant_id=restaurant_id)
                .select_related('device', 'restaurant', 'guest_session', 'business_day', 'bill')
                .prefetch_related('order_items__item', 'payments')
                .order_by('-created_time')
             )
             if getattr(user, "role", None) in {"staff", "manager", "owner"}:
                 return queryset.exclude(
                     Q(status='awaiting_payment') & ~Q(payment_status='pending_cash')
                 )
             return queryset.exclude(status='awaiting_payment')
        
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
        ensure_payment_schema()
        user = request.user
        new_status = request.data.get('status')
        if new_status not in dict(Order._meta.get_field('status').choices):
            return Response({"detail": "Invalid status value"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found"}, status=status.HTTP_404_NOT_FOUND)

        is_chef = ChefStaff.objects.filter(user=user, restaurant=order.restaurant, action='accepted').exists()
        if not is_chef:
            return Response({"detail": "You are not authorized to update this order."}, status=status.HTTP_403_FORBIDDEN)


        
        if order.status == "completed":
            return Response({"detail": "Order already completed"}, status=status.HTTP_400_BAD_REQUEST)

        completion_block = _block_unpaid_completion(order, new_status)
        if completion_block is not None:
            return completion_block
        release_block = _block_unpaid_kitchen_release(order, new_status)
        if release_block is not None:
            return release_block

        order.status = new_status
        if new_status == "cancelled":
            _cancel_pending_payments(order)
        order.save(update_fields=['status', 'payment_status', 'updated_time'])

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

        # Deterministic recommendations from this compatibility endpoint are
        # retired. Only /api/upsell/smart-suggestions may return an LLM-chosen
        # customer-facing item.
        return Response({
            'cart_id': cart.id,
            'suggestions': [],
            'agent_decision': {
                'suggest_nothing': True,
                'reason': 'The legacy deterministic upsell endpoint is disabled.',
                'decision_source': 'legacy_endpoint_disabled',
            },
        })
