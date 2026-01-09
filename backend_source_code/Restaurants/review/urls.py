from django.urls import path
from .views import (
    CreateReviewAPIView,
    OwnerRestaurantReviewListAPIView
)

urlpatterns = [
    path('create/', CreateReviewAPIView.as_view(), name='create-review'),
    path('list/', OwnerRestaurantReviewListAPIView.as_view(), name='owner-review-list'),
]
