import stripe
from django.shortcuts import render, redirect
from django.http import JsonResponse
from order.models import Order
from .models import Payment
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from .models import StripeDetails
from .serializers import StripeDetailsSerializer
from rest_framework.viewsets import ModelViewSet
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from order.serializers import OrderDetailSerializer
from message.models import ChatMessage

channel_layer = get_channel_layer()




class StripeDetailsViewSet(ModelViewSet):
    serializer_class = StripeDetailsSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Limit queryset to the user's restaurants only."""
        user = self.request.user
        return StripeDetails.objects.filter(restaurant__owner=user)

    def perform_create(self, serializer):
        """Automatically associate the StripeDetails with the user's first restaurant."""
        user = self.request.user
        restaurant = user.restaurants.first()

        if StripeDetails.objects.filter(restaurant=restaurant).exists():
            raise ValidationError("You already have StripeDetails associated with this restaurant. Please update it instead.")

        if not restaurant:
            raise ValidationError("User does not own any restaurants.")
        serializer.save(restaurant=restaurant)

    def perform_update(self, serializer):
        """Ensure that StripeDetails are updated with the user's restaurant."""
        user = self.request.user
        restaurant = user.restaurants.first()

        if not restaurant:
            raise ValidationError("User does not own any restaurants.")

        if serializer.instance.restaurant != restaurant:
            raise ValidationError("You cannot update StripeDetails for a restaurant that you do not own.")
        serializer.save(restaurant=restaurant)




class CreateCheckoutSessionView(APIView):
    """API View for creating a Stripe checkout session"""

    def post(self, request, order_id):
        try:
            # Retrieve the order
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        # Get the Stripe details for the restaurant associated with the order
        try:
            stripe_details = StripeDetails.objects.get(restaurant=order.restaurant)
        except StripeDetails.DoesNotExist:
            return Response({'error': 'Stripe details not found for the restaurant'}, status=status.HTTP_404_NOT_FOUND)
        
        # currency = stripe_details.currency if hasattr(stripe_details, 'currency') else 'usd'
        
        # valid_currencies = ['usd','aed']
        # if currency not in valid_currencies:
        #     return Response({'error': 'Unsupported currency'}, status=status.HTTP_400_BAD_REQUEST)

        # Set up Stripe API with the secret key
        stripe_secret_key = stripe_details.get_decrypted_secret_key()
        print(stripe_secret_key)
        stripe.api_key = stripe_secret_key

        try:
            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': 'aed',
                        'product_data': {
                            'name': f'Order #{order.id} Payment',
                        },
                        'unit_amount': int(order.total_price * 100),
                    },
                    'quantity': 1,
                }],
                mode='payment',
                # success_url=f'http://localhost:5175/dashboard/success/' + '?session_id={CHECKOUT_SESSION_ID}',
                success_url=f'https://clever-biz2.netlify.app/dashboard/success/' + '?session_id={CHECKOUT_SESSION_ID}',
                cancel_url='https://clever-biz2.netlify.app/dashboard/cancel/',
            )

            # Save the payment details to the database
            Payment.objects.create(
                order=order,
                restaurant=order.restaurant,
                device=order.device,
                stripe_payment_intent_id=session.id,
                amount=order.total_price,
                status="pending"
            )

            # Return the checkout session URL to redirect the user
            return Response({'url': session.url})

        except stripe.error.StripeError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)




class PaymentSuccessView(APIView):
    """API view for handling successful payments"""

    def get(self, request):
        session_id = request.GET.get('session_id')
        if session_id:
            try:
                session = stripe.checkout.Session.retrieve(session_id)
                payment = Payment.objects.get(stripe_payment_intent_id=session.id)
                payment.status = "completed"
                payment.save()

                order = payment.order
                order.status = "paid"
                order.payment_status = "paid"
                order.save()

                order_data = OrderDetailSerializer(order).data
                async_to_sync(channel_layer.group_send)(
                    f"restaurant_{order.restaurant.id}",
                    {
                        "type": "order_paid",
                        "order": order_data
                    }
                )
                return Response({'session': session}, status=status.HTTP_200_OK)
            except Payment.DoesNotExist:
                return Response({'error': 'Payment not found'}, status=status.HTTP_404_NOT_FOUND)
            except stripe.error.StripeError as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'error': 'Session ID not provided'}, status=status.HTTP_400_BAD_REQUEST)




class PaymentCancelView(APIView):
    """API view for handling canceled payments"""

    def get(self, request):
        return Response({'message': 'Payment was canceled'}, status=status.HTTP_200_OK)




