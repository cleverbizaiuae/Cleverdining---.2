from django.shortcuts import render
from rest_framework import generics, permissions,filters
from rest_framework.response import Response
from rest_framework import status
from .models import Review
from .serializers import ReviewSerializer,GetReviewSerializer
from rest_framework.exceptions import ValidationError
from accounts.permissions import IsCustomerRole,IsOwnerRole
from rest_framework.exceptions import PermissionDenied
from .pagination import TenPerPagePagination
from django.utils.timezone import now
from rest_framework.decorators import action
from django.db.models import Avg
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

channel_layer = get_channel_layer()

# Create your views here.

class CreateReviewAPIView(generics.CreateAPIView):
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated,IsCustomerRole]

    def perform_create(self, serializer):
        user = self.request.user

        # Get the device
        device = user.devices.first()
        if not device:
            raise ValidationError("User is not linked to any device.")

        # Validate order belongs to this device and hasn't been reviewed
        order = serializer.validated_data['order']
        if order.device != device:
            raise ValidationError("This order is not linked to your device.")

        if hasattr(order, 'review'):
            raise ValidationError("This order already has a review.")

        review = serializer.save(device=device)
        review_data = GetReviewSerializer(review).data

        async_to_sync(channel_layer.group_send)(
            f"restaurant_{device.restaurant.id}",
            {
                "type": "review_created",
                "review": review_data
            }
        )




class OwnerRestaurantReviewListAPIView(generics.ListAPIView):
    serializer_class = GetReviewSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerRole]
    pagination_class = TenPerPagePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['order__id']

    def get_queryset(self):
        user = self.request.user

        if user.role != 'owner':
            raise PermissionDenied("Only restaurant owners can view this.")

        queryset = Review.objects.filter(
            order__restaurant__owner=user
        ).select_related('order', 'device').order_by('-created_time')

        # Filter by specific date (created_time's date part)
        date = self.request.query_params.get('date')
        if date:
            queryset = queryset.filter(created_time__date=date)

        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        # Pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
        else:
            serializer = self.get_serializer(queryset, many=True)

        # Status calculation
        reviews = self.get_queryset()
        overall_rating = reviews.aggregate(avg_rating=Avg('rating'))['avg_rating'] or 0
        today = now().date()
        today_reviews_count = reviews.filter(created_time__date=today).count()
        total_reviews_count = reviews.count()

        response_data = {
            "count": self.paginator.page.paginator.count if page is not None else total_reviews_count,
            "next": self.paginator.get_next_link() if page is not None else None,
            "previous": self.paginator.get_previous_link() if page is not None else None,
            "status": {
                "overall_rating": round(overall_rating, 2),
                "today_reviews_count": today_reviews_count,
                "total_reviews_count": total_reviews_count
            },
            "results": serializer.data
        }

        return Response(response_data)