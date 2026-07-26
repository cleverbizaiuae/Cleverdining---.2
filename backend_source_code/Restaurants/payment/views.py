import stripe
from decimal import Decimal, ROUND_HALF_UP
from django.shortcuts import render, redirect
from django.http import JsonResponse
from order.models import Order
from django.db.models import Q
from .models import Payment, PaymentGateway
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from .models import StripeDetails
from .serializers import StripeDetailsSerializer, PaymentGatewaySerializer
from rest_framework.viewsets import ModelViewSet
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from order.serializers import OrderDetailSerializer
from message.models import ChatMessage
from restaurant.region_config import get_region_config
from .split_bill import build_bill_summary, mark_payment_failed
from .schema_guard import ensure_payment_schema
from .recovery import reconcile_legacy_stripe_gateway
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

channel_layer = get_channel_layer()


def _append_redirect_query(url, **params):
    parsed = urlparse(url or "")
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    for key, value in params.items():
        if value is not None:
            query[key] = value
    return urlunparse(parsed._replace(query=urlencode(query)))


def _payment_client_url(payment, key, fallback):
    raw = payment.raw_response if isinstance(payment.raw_response, dict) else {}
    return raw.get(key) or fallback


class PaymentGatewayViewSet(ModelViewSet):
    serializer_class = PaymentGatewaySerializer
    permission_classes = [IsAuthenticated] # Logic handled in get_queryset

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'role', '') == 'owner':
            return PaymentGateway.objects.filter(restaurant__owner=user)
        elif getattr(user, 'role', '') in ['manager']: # Staff/Chef usually shouldn't edit Gateways? User said "Manager Portal".
            # Allow manager to VIEW/EDIT gateways
            from accounts.models import ChefStaff
            chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
            if chef_staff:
                return PaymentGateway.objects.filter(restaurant=chef_staff.restaurant)
        return PaymentGateway.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        restaurant = None
        if getattr(user, 'role', '') == 'owner':
            restaurant = user.restaurants.first()
        elif getattr(user, 'role', '') in ['manager']:
            from accounts.models import ChefStaff
            chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
            if chef_staff:
                restaurant = chef_staff.restaurant
        
        if not restaurant:
            raise ValidationError("You do not have a valid restaurant association.")

        provider = serializer.validated_data.get('provider')
        if provider:
            allowed = set(get_region_config(getattr(restaurant, 'region', 'UAE')).get('payments', []))
            if provider not in allowed:
                raise ValidationError(
                    f"Provider '{provider}' is not supported for region {getattr(restaurant, 'region', 'UAE')}"
                )
        
        # If setting as active, deactivate others
        if serializer.validated_data.get('is_active', False):
             PaymentGateway.objects.filter(restaurant=restaurant).update(is_active=False)

        serializer.save(restaurant=restaurant)

    def perform_update(self, serializer):
        user = self.request.user
        restaurant = None
        if getattr(user, 'role', '') == 'owner':
            restaurant = user.restaurants.first()
        elif getattr(user, 'role', '') in ['manager']:
             from accounts.models import ChefStaff
             chef_staff = ChefStaff.objects.filter(user=user, action='accepted').first()
             if chef_staff:
                 restaurant = chef_staff.restaurant

        if not restaurant:
             raise ValidationError("You do not have a valid restaurant association.")

        if serializer.instance.restaurant != restaurant:
            raise ValidationError("You cannot update settings for a restaurant that you do not own/manage.")

        provider = serializer.validated_data.get('provider')
        if provider:
            allowed = set(get_region_config(getattr(restaurant, 'region', 'UAE')).get('payments', []))
            if provider not in allowed:
                raise ValidationError(
                    f"Provider '{provider}' is not supported for region {getattr(restaurant, 'region', 'UAE')}"
                )
            
        if serializer.validated_data.get('is_active', False):
             PaymentGateway.objects.filter(restaurant=restaurant).exclude(id=serializer.instance.id).update(is_active=False)
             
        serializer.save(restaurant=restaurant)


class StripeDetailsViewSet(ModelViewSet):
    serializer_class = StripeDetailsSerializer
    permission_classes = [IsAuthenticated]
    # ... (rest of StripeDetailsViewSet logic if we keep it for legacy)
    def get_queryset(self):
        """Limit queryset to the user's restaurants only."""
        user = self.request.user
        return StripeDetails.objects.filter(restaurant__owner=user)

    def perform_create(self, serializer):
        """Automatically associate the StripeDetails with the user's first restaurant."""
        user = self.request.user
        restaurant = user.restaurants.first()

        if not restaurant:
            raise ValidationError("User does not own any restaurants.")
        if StripeDetails.objects.filter(restaurant=restaurant).exists():
            raise ValidationError("You already have StripeDetails associated with this restaurant. Please update it instead.")

        serializer.save(restaurant=restaurant)
        reconcile_legacy_stripe_gateway(restaurant, force=True)

    def perform_update(self, serializer):
        """Ensure that StripeDetails are updated with the user's restaurant."""
        user = self.request.user
        restaurant = user.restaurants.first()

        if not restaurant:
            raise ValidationError("User does not own any restaurants.")

        if serializer.instance.restaurant != restaurant:
            raise ValidationError("You cannot update StripeDetails for a restaurant that you do not own.")
        serializer.save(restaurant=restaurant)
        reconcile_legacy_stripe_gateway(restaurant, force=True)




from .services import PaymentService


from django.utils.timezone import now

class CreateBulkCheckoutSessionView(APIView):
    """
    API View for creating a BULK checkout session for all unpaid orders in a session.
    """
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        ensure_payment_schema()
        # 1. Resolve Guest Session
        session_token = request.headers.get('X-Guest-Session-Token')
        if not session_token:
            session_token = request.data.get('guest_session_token')
            
        if not session_token:
             return Response({'error': 'Missing session token'}, status=status.HTTP_401_UNAUTHORIZED)

        from device.models import GuestSession
        try:
            # Try active session first, then fall back to most recent inactive
            # (allows returning customers to pay for orders from expired sessions)
            session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
            if not session:
                raise GuestSession.DoesNotExist
        except GuestSession.DoesNotExist:
            return Response({'error': 'Invalid or expired session'}, status=status.HTTP_403_FORBIDDEN)

        # 2. Get Unpaid Orders
        # Include all checkout-eligible unpaid states.
        # Exclude: only orders that are already PAID
        eligible_statuses = [
            'pending',
            'preparing',
            'served',
            'delivered',
            'completed',
            'awaiting_cash',
            'awaiting_payment',
        ]
        # Include all unpaid orders for the same current table/device to avoid missing orders
        # when session records rotate or split.
        session_scope = Q(guest_session=session)
        if session.created_at:
            session_scope |= Q(device=session.device, created_time__gte=session.created_at)
        unpaid_orders = Order.objects.filter(
            session_scope,
            restaurant=session.device.restaurant,
            status__in=eligible_statuses,
        ).exclude(payment_status='paid').distinct()
        
        if not unpaid_orders.exists():
             return Response({'error': 'No unpaid orders found'}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Aggregation: charge only the outstanding table balance.
        total_amount = sum(
            max(Decimal(order.total_price or 0) - Decimal(getattr(order, "amount_paid", 0) or 0), Decimal("0"))
            for order in unpaid_orders
        )
        
        if total_amount == 0:
            return Response({'error': 'Total amount is 0'}, status=status.HTTP_400_BAD_REQUEST)

        split_count = request.data.get('split_count')
        try:
            split_count = max(2, int(split_count)) if split_count else None
        except (TypeError, ValueError):
            return Response({'error': 'split_count must be a number of 2 or more'}, status=status.HTTP_400_BAD_REQUEST)
        split_amount = (
            (total_amount / Decimal(split_count)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if split_count
            else total_amount
        )

        # Provider
        provider = request.data.get('provider') 
        if not provider:
            provider = request.query_params.get('provider')
        origin = request.headers.get('Origin') or 'https://officialcleverdiningcustomer.netlify.app'
        default_success_url = f'{origin}/thankyou'
        split_success_url = f'{origin}/dashboard/success/?payment=partial'

        if split_count:
            primary_order = unpaid_orders.last()
            try:
                result = PaymentService.create_payment(
                    order=primary_order,
                    success_url=split_success_url,
                    cancel_url=f'{origin}/dashboard/orders/?payment=cancelled',
                    provider=provider or None,
                    amount=split_amount,
                    metadata={
                        'type': 'bulk_session_evenly',
                        'guest_session_id': session.id,
                        'split_count': split_count,
                    },
                    created_by=f'guest_bulk_evenly:{session.id}:{split_count}',
                )
                result.update({
                    'is_partial': True,
                    'split_count': split_count,
                    'amount': str(split_amount),
                    'total_amount': str(total_amount),
                    'remaining_amount': str(total_amount),
                    'fully_paid': False,
                })
                return Response(result)
            except ValidationError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            except Exception as e:
                return Response({'error': f"Payment Init Failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # 4. Processing
        if provider == 'cash':
            import sys, traceback
            try:
                # 1. Cache the list of orders BEFORE update
                all_orders = list(unpaid_orders)
                
                if not all_orders:
                     return Response({'error': 'No orders to process'}, status=400)

                # Record cash as the active payment method for every order.
                # CashAdapter deliberately preserves awaiting_payment so
                # pay-before orders cannot reach the kitchen before collection.
                for cash_order in all_orders:
                    outstanding = max(
                        Decimal(cash_order.total_price or 0)
                        - Decimal(getattr(cash_order, "amount_paid", 0) or 0),
                        Decimal("0"),
                    )
                    PaymentService.create_payment(
                        order=cash_order,
                        success_url='',
                        cancel_url='',
                        provider='cash',
                        amount=outstanding,
                        metadata={'suppress_cash_alert': True},
                        created_by=f'guest_bulk_cash:{session.id}',
                    )
                    cash_order.refresh_from_db()

                first_order = all_orders[0]
                
                # Safeguard device attribute access
                table_name = 'Unknown'
                try:
                    table_name = session.device.table_number or session.device.table_name or f'Device {session.device_id}'
                except Exception:
                    table_name = f'Device {session.device_id}'

                # Create items summary
                items_summary = []
                for o in all_orders:
                    for item in o.order_items.all():
                        items_summary.append({
                            "item_name": f"(Order #{o.id}) {item.item.item_name}", 
                            "quantity": item.quantity, 
                            "price": str(item.price)
                        })

                tip_total = sum(float(o.tip_amount or 0) for o in all_orders)
                order_total = sum(Decimal(o.total_price or 0) for o in all_orders)
                already_paid = sum(Decimal(o.amount_paid or 0) for o in all_orders)

                print(f"[CASH-PAYMENT] Processing cash | session={session.id} | orders={[o.id for o in all_orders]} | total={total_amount} | tip={tip_total} | table={table_name}", file=sys.stderr)

                # Best-effort WebSocket notifications — don't crash if Redis is down
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"restaurant_{first_order.restaurant.id}",
                        {
                            "type": "cash_payment_alert",
                            "order": {
                                 "id": f"BULK-{session.id}", 
                                 "device_name": table_name,
                                 "items": items_summary,
                                 "tip_amount": tip_total,
                                 "currency": str(first_order.restaurant.currency or "AED").upper(),
                            }, 
                            "order_ids": [order.id for order in all_orders],
                            "table_number": table_name,
                            "total_amount": str(total_amount),
                            "order_total": str(order_total),
                            "already_paid": str(already_paid),
                            "currency": str(first_order.restaurant.currency or "AED").upper(),
                            "timestamp": str(now()),
                            "is_bulk": True,
                            "session_id": session.id
                        }
                    )
                except Exception as ws_err:
                    print(f"[CASH-PAYMENT] ⚠️ Redis/WS notification failed (restaurant alert): {ws_err}", file=sys.stderr)
                
                # Notify User Session
                bulk_status = (
                    'awaiting_payment'
                    if any(order.status == 'awaiting_payment' for order in all_orders)
                    else 'awaiting_cash'
                )
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"session_{session.id}",
                        {
                            "type": "order_status_update", 
                            "status": bulk_status,
                            "bulk": True
                        }
                    )
                except Exception as ws_err:
                    print(f"[CASH-PAYMENT] ⚠️ Redis/WS notification failed (session alert): {ws_err}", file=sys.stderr)

                print(f"[CASH-PAYMENT] ✅ Success | DB updated, WS notifications attempted", file=sys.stderr)
                
                return Response({
                    'url': f"{default_success_url}?session_id=bulk_cash_{session.id}&amount={total_amount}",
                    'provider': 'cash'
                })

            except Exception as e:
                print(f"[CASH-PAYMENT] ❌ CRASH: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                return Response({'error': f'Cash payment failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        else:
             backend_origin = f"{request.scheme}://{request.get_host()}"
             if provider == 'payme':
                 # Payme should return through backend callback so we can verify and then redirect.
                 success_url = f"{backend_origin}/api/customer/payment/payme/return/"
                 cancel_url = f"{backend_origin}/api/customer/payment/payme/return/?status=cancelled"
             else:
                 success_url = f'{origin}/thankyou'
                 cancel_url = f'{origin}/dashboard/orders/?payment=cancelled'

             # Use latest unpaid order as anchor for session-wide checkout metadata.
             primary_order = unpaid_orders.last()
             target_provider = provider or None

             try:
                 result = PaymentService.create_payment(
                     order=primary_order,
                     success_url=success_url,
                     cancel_url=cancel_url,
                     provider=target_provider,
                     amount=total_amount,
                     metadata={
                        'type': 'bulk_session',
                        'guest_session_id': session.id,
                        'primary_order_id': primary_order.id
                     },
                     created_by='guest_bulk' # Explicitly set created_by for verification logic
                 )
                 
                 # The result from PaymentService already contains 'url', 'transaction_id', etc.
                 # We no longer need to manually update the payment record as create_payment handles it.
                 
                 return Response(result)

             except ValidationError as e:
                 return Response({'error': str(e)}, status=400)
             except Exception as e:
                 return Response({'error': f"Payment Init Failed: {str(e)}"}, status=500)

class CreateCheckoutSessionView(APIView):
    """API View for creating a checkout session (Unified)"""
    permission_classes = [] # Allow guests (manual token check inside)
    authentication_classes = []

    def post(self, request, order_id):
        ensure_payment_schema()
        # 1. Resolve Guest Session
        session_token = request.headers.get('X-Guest-Session-Token')
        if not session_token:
            session_token = request.data.get('guest_session_token')
            
        if not session_token:
            session_token = request.query_params.get('guest_token')
            
        if not session_token:
             return Response({'error': 'Missing session token'}, status=status.HTTP_401_UNAUTHORIZED)

        from device.models import GuestSession
        # Resilient lookup: try active first, fall back to most recent
        session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
        if not session:
            return Response({'error': 'Invalid or expired session'}, status=status.HTTP_403_FORBIDDEN)

        try:
            # 2. Strict Order Validation
            # Ensure order belongs to the session's table (or session itself if strict-strict)
            # For now, matching Table ID is the critical isolation requirement.
            order = Order.objects.get(id=order_id, device=session.device)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found or access denied'}, status=status.HTTP_404_NOT_FOUND)

        # Get Provider (Optional, defaults to None -> Active Gateway)
        provider = request.data.get('provider') 
        if not provider:
            provider = request.query_params.get('provider')

        # Dynamic URL construction based on Origin
        origin = request.headers.get('Origin') or 'https://officialcleverdiningcustomer.netlify.app'
        backend_origin = f"{request.scheme}://{request.get_host()}"
        if provider == 'payme':
            success_url = f"{backend_origin}/api/customer/payment/payme/return/"
            cancel_url = f"{backend_origin}/api/customer/payment/payme/return/?status=cancelled"
        else:
            success_url = f'{origin}/thankyou'
            # User requested redirection to Orders on cancel with status
            cancel_url = f'{origin}/dashboard/orders/?payment=cancelled'

        # --- Handle Tip Update ---
        tip_amount = request.data.get('tip_amount')
        tip_type = request.data.get('tip_type')
        tip_value = request.data.get('tip_value') # Percentage or Custom Value

        if tip_amount is not None:
            try:
                tip_amount = float(tip_amount)
                if tip_amount < 0:
                    raise ValidationError("Tip amount cannot be negative")
                
                # Recalculate Total
                # 1. Calculate Subtotal from Items
                subtotal = sum(item.quantity * item.price for item in order.order_items.all())
                
                # 2. Add Tip
                # Note: If there are Taxes/Service Charges, they should be added here too.
                # Assuming current total_price might include them? 
                # Safer Approach: subtotal + tip. If taxes exist, we might be overwriting them if we don't know them.
                # Given user prompt "Total = subtotal + VAT + service charges + tip", we need those values.
                # Since we don't have tax/service fields, we will assume for now Total = Subtotal + Tip.
                # OR we can assume order.total_price currently hols Subtotal+Tax, and we just Add Tip to it.
                # Let's subtract OLD tip first (if any) then add NEW tip?
                # No, best is to Recalculate Subtotal + Tip.
                
                # Let's assume order.total_price is the source of truth for (Subtotal + Tax).
                # But wait, if we added tip previously, total_price includes it.
                # We should subtract the OLD tip_amount.
                current_total_without_tip = float(order.total_price) - float(order.tip_amount)
                
                new_total = current_total_without_tip + tip_amount
                
                order.tip_amount = tip_amount
                order.tip_type = tip_type
                if tip_type == 'percentage' or tip_type == 'custom_percentage':
                     order.tip_percentage = tip_value
                
                order.total_price = new_total
                order.save()
                
            except ValueError:
                return Response({'error': 'Invalid tip amount'}, status=status.HTTP_400_BAD_REQUEST)

        split_type = str(request.data.get("split_type") or "full_bill").strip().lower()
        split_data = None
        if split_type in {"full_bill", "evenly", "my_items"}:
            split_data = {
                "split_type": split_type,
                "split_count": request.data.get("split_count"),
                "selected_items": request.data.get("selected_items") or [],
                "participant": request.data.get("participant"),
                "payer_id_or_name": request.data.get("payer_id_or_name"),
            }

        try:
            created_by = 'pre_order' if order.status == 'awaiting_payment' else None
            result = PaymentService.create_payment(
                order,
                success_url,
                cancel_url,
                provider=provider,
                split_data=split_data,
                created_by=created_by,
            )
            return Response(result)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SplitBillSummaryView(APIView):
    permission_classes = []
    authentication_classes = []

    def get(self, request, order_id):
        ensure_payment_schema()
        session_token = request.headers.get('X-Guest-Session-Token')
        if not session_token:
            session_token = request.query_params.get('guest_token')
        if not session_token:
            return Response({'error': 'Missing session token'}, status=status.HTTP_401_UNAUTHORIZED)

        from device.models import GuestSession
        session = GuestSession.objects.filter(session_token=session_token).order_by('-is_active', '-created_at').first()
        if not session:
            return Response({'error': 'Invalid or expired session'}, status=status.HTTP_403_FORBIDDEN)

        try:
            order = Order.objects.get(id=order_id, device=session.device)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found or access denied'}, status=status.HTTP_404_NOT_FOUND)

        try:
            payload = build_bill_summary(order)
            return Response(payload)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VerifyPaymentView(APIView):
    """Unified Payment Verification View"""
    def post(self, request):
        ensure_payment_schema()
        data = request.data
        # We need to identify the payment to verify. 
        # For Checkout.com, we get cko-session-id. For Stripe, we get session_id.
        
        transaction_id = (
            data.get('cko-session-id')
            or data.get('session_id')
            or data.get('transaction_id')
            or data.get('payment_id')
            or data.get('id')
        )
        
        if not transaction_id:
             return Response({'error': 'Transaction ID (session_id or cko-session-id) is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Try to find payment by transaction_id (or stripe_payment_intent_id for legacy)
            payment = Payment.objects.filter(transaction_id=transaction_id).first()
            if not payment:
                 # Legacy check
                 payment = Payment.objects.filter(stripe_payment_intent_id=transaction_id).first()
            
            if not payment:
                return Response({'error': 'Payment record not found'}, status=status.HTTP_404_NOT_FOUND)

            result = PaymentService.verify_payment(payment, data)
            return Response(result)

        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PaymentWebhookView(APIView):
    """Unified Webhook Handler"""
    authentication_classes = [] # Webhooks are not authenticated via user token
    permission_classes = []

    def post(self, request, provider):
        try:
            PaymentService.handle_webhook(provider, request)
            return Response({'status': 'received'}, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Log error
            print(f"Webhook Error: {e}")
            return Response({'error': 'Internal Server Error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Keep legacy views for backward compatibility if needed, or redirect them
class PaymentSuccessView(APIView):
    def get(self, request):
        # This was the old Stripe success callback
        session_id = request.GET.get('session_id')
        if not session_id:
             return Response({'error': 'Session ID missing'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Reuse the unified verification logic
        # We construct a mock request data
        return VerifyPaymentView().post(type('MockRequest', (), {'data': {'session_id': session_id}})())

class PaymentCancelView(APIView):
    """API view for handling canceled payments"""
    def get(self, request):
        return Response({'message': 'Payment was canceled'}, status=status.HTTP_200_OK)

class VerifyCheckoutPaymentView(APIView):
     """Checkout.com payment verification - redirects to unified view"""
     def post(self, request):
         return VerifyPaymentView().post(request)

class PayTabsReturnView(APIView):
    """
    Handles the POST redirect from PayTabs (Return URL).
    Verifies payment and redirects user to Frontend.
    """
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        ensure_payment_schema()
        data = request.data
        # PayTabs sends status in POST body: response_status, tran_ref, etc.
        
        # 1. Identify Transaction
        tran_ref = data.get('tran_ref')
        resp_status = data.get('respStatus') # A=Authorized, C=Cancelled, E=Error, D=Declined
        resp_message = data.get('respMessage', '')
        
        if not tran_ref:
             # Fallback: Redirect to Cancelled if no data
             from django.shortcuts import redirect
             return redirect('https://officialcleverdiningcustomer.netlify.app/dashboard/orders/?payment=failed&reason=unknown')

        # 2. Verify/Update Payment Status in DB
        # We can reuse PaymentService logic if we can find the payment object.
        payment = Payment.objects.filter(transaction_id=tran_ref).first()
        
        if payment:
            if resp_status == 'A':
                 # Successful!
                 # Call Service to finalize (update status, notify, clear cart)
                 # We can mock a verification data packet
                 verification_data = {
                     'payment_result': {'response_status': 'A'},
                     'response_status': 'A',
                     'tran_ref': tran_ref,
                     'cart_amount': data.get('cart_amount'),
                 }
                 PaymentService.verify_payment(payment, verification_data)
                 
                 # Redirect to Success
                 success_url = _payment_client_url(
                     payment,
                     '_client_success_url',
                     'https://officialcleverdiningcustomer.netlify.app/thankyou',
                 )
                 return redirect(_append_redirect_query(success_url, session_id=tran_ref))
            
            else:
                 # Failed/Cancelled
                 payment.status = 'failed'
                 payment.save(update_fields=["status", "updated_at"])
                 mark_payment_failed(payment)
                 cancel_url = _payment_client_url(
                     payment,
                     '_client_cancel_url',
                     'https://officialcleverdiningcustomer.netlify.app/dashboard/orders/',
                 )
                 return redirect(_append_redirect_query(cancel_url, payment='failed', reason=resp_message))
        
        else:
             # Payment not found?
             return redirect('https://officialcleverdiningcustomer.netlify.app/dashboard/orders/?payment=failed&reason=checkout_not_found')

    def get(self, request):
        # Allow GET access just in case PayTabs does a GET redirect (config dependent)
        # Handle query params instead of post data
        return self.post(request)


class PaymeReturnView(APIView):
    """
    Handles Payme return callback for UK open-banking flow.
    """
    permission_classes = []
    authentication_classes = []

    def _payload(self, request):
        data = {}
        if hasattr(request, "data") and request.data:
            try:
                for key in request.data:
                    value = request.data.get(key)
                    data[key] = value
            except Exception:
                data.update(dict(request.data))
        if hasattr(request, "query_params"):
            for key in request.query_params:
                data[key] = request.query_params.get(key)
        return data

    def _redirect_failed(self, reason="payme_failed"):
        payment = getattr(self, "_current_payment", None)
        cancel_url = _payment_client_url(
            payment,
            '_client_cancel_url',
            'https://officialcleverdiningcustomer.netlify.app/dashboard/orders/',
        ) if payment else 'https://officialcleverdiningcustomer.netlify.app/dashboard/orders/'
        return redirect(
            _append_redirect_query(cancel_url, payment='failed', reason=reason)
        )

    def _redirect_success(self, txn):
        payment = getattr(self, "_current_payment", None)
        success_url = _payment_client_url(
            payment,
            '_client_success_url',
            'https://officialcleverdiningcustomer.netlify.app/thankyou',
        ) if payment else 'https://officialcleverdiningcustomer.netlify.app/thankyou'
        return redirect(
            _append_redirect_query(success_url, session_id=txn)
        )

    def post(self, request):
        ensure_payment_schema()
        data = self._payload(request)
        transaction_id = (
            data.get("transaction_id")
            or data.get("payment_id")
            or data.get("id")
            or data.get("session_id")
        )
        if not transaction_id:
            return self._redirect_failed("missing_transaction")

        payment = Payment.objects.filter(transaction_id=transaction_id).first()
        if not payment:
            return self._redirect_failed("checkout_not_found")
        self._current_payment = payment

        status_value = str(data.get("status") or "").lower()
        if status_value in {"paid", "success", "succeeded", "completed"}:
            verification_payload = {
                "transaction_id": transaction_id,
                "status": "completed",
                "amount": data.get("amount"),
            }
            PaymentService.verify_payment(payment, verification_payload)
            return self._redirect_success(transaction_id)

        # Fallback verification when status is missing or unknown in redirect payload.
        if not status_value:
            verification_result = PaymentService.verify_payment(
                payment,
                {"transaction_id": transaction_id},
            )
            if verification_result.get("status") == "completed":
                return self._redirect_success(transaction_id)

        payment.status = "failed"
        payment.save(update_fields=["status", "updated_at"])
        mark_payment_failed(payment)
        return self._redirect_failed(status_value or "payme_failed")

    def get(self, request):
        return self.post(request)
