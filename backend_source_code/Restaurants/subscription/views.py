from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse, HttpResponse
from django.http import JsonResponse
from django.conf import settings
from restaurant.models import Restaurant
from subscription.models import Subscription,StripeEventLog
from accounts.models import User
import stripe
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from accounts.permissions import IsAllowedRole,IsAdminRole
from rest_framework import permissions
from rest_framework_simplejwt.authentication import JWTAuthentication
from datetime import datetime, timezone as dt_timezone
from django.db import transaction
from .serializers import SubscriptionStatusUpdateSerializer
from rest_framework import status



stripe.api_key = settings.STRIPE_SECRET_KEY

# Create your views here.
class CreateCheckoutSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def post(self, request, *args, **kwargs):
        try:
            user = request.user
            price_id = request.data.get("price_id")
            if not price_id:
                return Response({'error': 'price_id is required'}, status=400)

            checkout_session = stripe.checkout.Session.create(
                customer_email=user.email,
                payment_method_types=['card'],
                line_items=[{
                    'price': price_id,
                    'quantity': 1,
                }],
                mode='subscription',
                success_url='http://127.0.0.1:8000/?success=success',
                cancel_url='http://127.0.0.1:8000/?cancel=cancel',
            )

            return Response({'url': checkout_session.url})
        except Exception as e:
            print(e)
            return Response({'error': str(e)}, status=400)
        



class StripePortalSessionView(APIView):

    def post(self, request):
        try:
            session_id = request.data.get('session_id')
            if not session_id:
                return Response({'error': 'session_id is required'}, status=400)
            checkout_session = stripe.checkout.Session.retrieve(session_id)
            portal_session = stripe.billing_portal.Session.create(
                customer=checkout_session.customer,
                return_url='http://127.0.0.1:8000/',
            )

            return Response({'url': portal_session.url})
        except Exception as e:
            return Response({'error': str(e)}, status=400)




@method_decorator(csrf_exempt, name='dispatch')
class StripeWebhookView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        payload = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
        endpoint_secret = settings.STRIPE_WEBHOOK_SECRET

        try:
            event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
        except Exception as e:
            return JsonResponse({'error': f'Invalid signature: {str(e)}'}, status=400)

        event_id = event['id']
        event_type = event['type']
        data = event['data']['object']

        # Idempotency check
        if StripeEventLog.objects.filter(event_id=event_id).exists():
            print(f"Duplicate event skipped: {event_id}")
            return HttpResponse(status=200)

        # Log the event
        StripeEventLog.objects.create(
            event_id=event_id,
            event_type=event_type,
            payload=event
        )

        try:
            with transaction.atomic():
                if event_type == 'checkout.session.completed':
                    session = data
                    customer_email = session.get('customer_email')
                    subscription_id = session.get('subscription')

                    print("Customer email:", customer_email)
                    print("Subscription ID:", subscription_id)

                    user = User.objects.filter(email=customer_email).first()
                    restaurant = Restaurant.objects.filter(owner=user).first()

                    if not restaurant:
                        raise Exception("Restaurant not found for this user.")

                    stripe_sub = stripe.Subscription.retrieve(subscription_id, expand=['items'])
                    item = stripe_sub['items']['data'][0] if stripe_sub['items']['data'] else None
                    price = item.get('price') if item else None


                    product_id = price.get('product') if price else None
                    product = stripe.Product.retrieve(product_id) if product_id else None
                    product_name = product.get('name') if product else None


                    current_period_end = stripe_sub.get('current_period_end') or (
                        item.get('current_period_end') if item else None
                    )
                    if current_period_end:
                        current_period_end = datetime.fromtimestamp(current_period_end, tz=dt_timezone.utc)


                    interval = item.get('plan', {}).get('interval', 'unknown') if item else 'unknown'
                    interval_count = item.get('plan', {}).get('interval_count', 0) if item else 0
                    package_name = f"{interval} {interval_count}"
                    unit_amount = price.get('unit_amount') / 100 if price and price.get('unit_amount') else None

                    Subscription.objects.create(
                        restaurant=restaurant,
                        stripe_customer_id=stripe_sub['customer'],
                        stripe_subscription_id=stripe_sub['id'],
                        package_name=package_name,
                        price_id=item['price']['id'] if item else None,
                        price=unit_amount,
                        status=stripe_sub['status'],
                        start_date=timezone.now(),
                        current_period_end=current_period_end,
                        cancel_at_period_end=stripe_sub.get('cancel_at_period_end', False),
                        latest_invoice=stripe_sub.get('latest_invoice'),
                        is_active=True
                    )

                    restaurant.package = package_name
                    restaurant.save()

                elif event_type == 'customer.subscription.deleted':
                    sub_id = data['id']
                    sub = Subscription.objects.filter(stripe_subscription_id=sub_id).first()
                    if sub:
                        sub.is_active = False
                        sub.status = "canceled"
                        sub.end_date = timezone.now()
                        sub.save()

                        if sub.restaurant:
                            sub.restaurant.package = None
                            sub.restaurant.save()

                elif event_type == 'customer.subscription.updated':
                    sub_id = data['id']
                    sub = Subscription.objects.filter(stripe_subscription_id=sub_id).first()
                    if sub:
                        current_period_end = data.get('current_period_end')
                        if current_period_end:
                            sub.current_period_end = datetime.fromtimestamp(current_period_end, tz=dt_timezone.utc)
                        sub.status = data.get('status', sub.status)
                        sub.cancel_at_period_end = data.get('cancel_at_period_end', sub.cancel_at_period_end)
                        sub.latest_invoice = data.get('latest_invoice', sub.latest_invoice)
                        sub.updated_at = timezone.now()
                        sub.save()

        except Exception as e:
            print(f"Webhook processing error: {e}")
            return JsonResponse({'error': str(e)}, status=500)

        return HttpResponse(status=200)




class CancelSubscriptionView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def post(self, request):
        user = request.user
        restaurant = Restaurant.objects.filter(owner=user).first()
        if not restaurant:
            return Response({'error': 'Restaurant not found.'}, status=404)

        subscription = Subscription.objects.filter(restaurant=restaurant, is_active=True).first()
        if not subscription:
            return Response({'error': 'Active subscription not found.'}, status=404)

        try:
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                cancel_at_period_end=True
            )

            subscription.cancel_at_period_end = True
            subscription.save()

            return Response({'message': 'Subscription will cancel at end of period.'}, status=200)
        except Exception as e:
            return Response({'error': str(e)}, status=400)
        


class SubscriptionStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def get(self, request):
        user = request.user
        restaurant = Restaurant.objects.filter(owner=user).first()
        if not restaurant:
            return Response({'error': 'Restaurant not found'}, status=404)

        subscription = Subscription.objects.filter(restaurant=restaurant, is_active=True).first()
        if not subscription:
            return Response({'status': 'no_active_subscription'})

        return Response({
            'package_name': subscription.package_name,
            'status': subscription.status,
            'current_period_end': subscription.current_period_end,
            'cancel_at_period_end': subscription.cancel_at_period_end,
        })
    


class RenewSubscriptionView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [JWTAuthentication]

    def post(self, request):
        user = request.user
        restaurant = Restaurant.objects.filter(owner=user).first()
        if not restaurant:
            return Response({'error': 'Restaurant not found'}, status=404)

        subscription = Subscription.objects.filter(restaurant=restaurant, is_active=True).first()
        if not subscription:
            return Response({'error': 'Active subscription not found.'}, status=404)

        try:
            # Remove cancel_at_period_end so it renews normally
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                cancel_at_period_end=False
            )

            subscription.cancel_at_period_end = False
            subscription.save()

            return Response({'message': 'Subscription renewal activated.'}, status=200)
        except Exception as e:
            return Response({'error': str(e)}, status=400)





class UpdateSubscriptionStatusAPIView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, restaurant_id):
        status_value = request.data.get('status')
        if not status_value:
            return Response({"error": "Status is required"}, status=status.HTTP_400_BAD_REQUEST)

        updated = Subscription.objects.filter(restaurant_id=restaurant_id).update(status=status_value)
        return Response({"message": f"Updated {updated} subscription(s)"})