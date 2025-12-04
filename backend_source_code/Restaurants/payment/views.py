import stripe
import razorpay
from django.shortcuts import render, redirect
from django.http import JsonResponse
from order.models import Order
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

channel_layer = get_channel_layer()


class PaymentGatewayViewSet(ModelViewSet):
    serializer_class = PaymentGatewaySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return PaymentGateway.objects.filter(restaurant__owner=user)

    def perform_create(self, serializer):
        user = self.request.user
        restaurant = user.restaurants.first()
        if not restaurant:
            raise ValidationError("User does not own any restaurants.")
        
        # If setting as active, deactivate others
        if serializer.validated_data.get('is_active', False):
             PaymentGateway.objects.filter(restaurant=restaurant).update(is_active=False)

        serializer.save(restaurant=restaurant)

    def perform_update(self, serializer):
        user = self.request.user
        restaurant = user.restaurants.first()
        if serializer.instance.restaurant != restaurant:
            raise ValidationError("You cannot update settings for a restaurant that you do not own.")
            
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




from .services import PaymentService

class CreateCheckoutSessionView(APIView):
    """API View for creating a checkout session (Unified)"""

    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        success_url = 'https://clever-biz2.netlify.app/dashboard/success/'
        cancel_url = 'https://clever-biz2.netlify.app/dashboard/cancel/'

        try:
            result = PaymentService.create_payment(order, success_url, cancel_url)
            return Response(result)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VerifyPaymentView(APIView):
    """Unified Payment Verification View"""
    def post(self, request):
        data = request.data
        # We need to identify the payment to verify. 
        # For Razorpay, we get order_id (transaction_id). For Stripe, we might get session_id.
        
        transaction_id = data.get('razorpay_order_id') or data.get('session_id')
        
        if not transaction_id:
             return Response({'error': 'Transaction ID (session_id or razorpay_order_id) is required'}, status=status.HTTP_400_BAD_REQUEST)

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

class VerifyRazorpayPaymentView(APIView):
     def post(self, request):
         return VerifyPaymentView().post(request)




