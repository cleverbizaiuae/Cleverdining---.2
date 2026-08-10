from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ChefStaff
from accounts.permissions import IsOwnerChefOrStaff

from .models import Order
from .serializers import OrderDetailSerializer


class OrderWalkInAPIView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerChefOrStaff]

    def patch(self, request, pk):
        is_walk_in = request.data.get("isWalkIn")
        if not isinstance(is_walk_in, bool):
            return Response(
                {"isWalkIn": ["This field is required and must be a boolean."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = get_object_or_404(
            Order.objects.select_related("restaurant", "restaurant__owner", "device"),
            pk=pk,
        )
        user = request.user
        role = getattr(user, "role", None)

        if role == "owner":
            has_access = order.restaurant.owner_id == user.id
        else:
            has_access = (
                ChefStaff.objects.filter(user=user, restaurant=order.restaurant)
                .exclude(action="hold")
                .exists()
            )
            if not has_access:
                try:
                    from staff.models import Staff

                    has_access = Staff.objects.filter(
                        user=user,
                        restaurant=order.restaurant,
                        is_active=True,
                    ).exists()
                except Exception:
                    has_access = False

        if not has_access:
            return Response(
                {"detail": "You are not authorized to update this order."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if order.is_walk_in != is_walk_in:
            order.is_walk_in = is_walk_in
            order.save(update_fields=["is_walk_in", "updated_time"])

        return Response(OrderDetailSerializer(order, context={"request": request}).data)
