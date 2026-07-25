# views.py
from django.db import transaction
from django.db.models import Max
from rest_framework import viewsets, permissions,generics, status
from rest_framework.decorators import action
from .models import Category, Restaurant
from .serializers import CategorySerializer,CustomerCategorySerializer, HierarchicalCategorySerializer, SubCategorySerializer
from rest_framework.exceptions import ValidationError, PermissionDenied
from accounts.permissions import IsOwnerRole,IsCustomerRole,IsOwnerChefOrStaff,IsChefOrStaff
from rest_framework.views import APIView
from rest_framework.response import Response
from accounts.models import ChefStaff
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .schema_guard import ensure_category_schema

channel_layer = get_channel_layer()



class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerChefOrStaff]
    pagination_class = None

    def get_serializer_class(self):
        request = getattr(self, "request", None)
        if request and request.query_params.get('hierarchy') == 'true':
            return HierarchicalCategorySerializer
        return CategorySerializer

    def get_queryset(self):
        try:
            ensure_category_schema()
            user = self.request.user
            role = getattr(user, 'role', None)
            
            if role == 'owner':
                queryset = Category.objects.filter(restaurant__owner=user)
            elif role in ['chef', 'staff', 'manager']:
                restaurant_ids = ChefStaff.objects.filter(
                    user=user,
                    action='accepted'
                ).values_list('restaurant_id', flat=True)
                queryset = Category.objects.filter(restaurant_id__in=restaurant_ids)
            else:
                queryset = Category.objects.none()

            if self.request.query_params.get('hierarchy') == 'true':
                return queryset.filter(level=0).order_by("display_order", "id")
            return queryset.order_by("display_order", "id")
        except Exception as e:
            print(f"CategoryViewSet.get_queryset error: {e}")
            import traceback
            traceback.print_exc()
            return Category.objects.none()

    def is_user_authorized(self, category):
        """Check if the current user is authorized for this category's restaurant."""
        user = self.request.user
        if category.restaurant.owner == user:
            return True
        role = getattr(user, 'role', None)
        if role in ['chef', 'staff', 'manager']:
            return ChefStaff.objects.filter(
                user=user, restaurant=category.restaurant, action='accepted'
            ).exists()
        return False

    def perform_create(self, serializer):
        user = self.request.user
        role = getattr(user, 'role', None)
        if role == 'owner':
            restaurant = Restaurant.objects.filter(owner=user).first()
        elif role in ['chef', 'staff', 'manager']:
            cs = ChefStaff.objects.filter(user=user, action='accepted').first()
            restaurant = cs.restaurant if cs else None
        else:
            restaurant = None
        if not restaurant:
            raise ValidationError("You don't have a restaurant yet.")

        next_order = (
            Category.objects.filter(restaurant=restaurant, parent_category__isnull=True)
            .aggregate(max_order=Max("display_order"))["max_order"]
        )
        category = serializer.save(
            restaurant=restaurant,
            display_order=0 if next_order is None else next_order + 1,
        )
        self.send_ws_event("category_created", category)

    def perform_update(self, serializer):
        category = self.get_object()
        if not self.is_user_authorized(category):
            raise PermissionDenied("You don't have permission to edit this category.")
        category = serializer.save()
        self.send_ws_event("category_updated", category)

    def perform_destroy(self, instance):
        if not self.is_user_authorized(instance):
            raise PermissionDenied("You don't have permission to delete this category.")
        restaurant_id = instance.restaurant.id
        category_id = instance.id
        instance.delete()
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant_id}",
                {"type": "category_deleted", "category_id": category_id}
            )
        except Exception as e:
            print(f"CategoryViewSet WS broadcast error (non-fatal): {e}")

    def send_ws_event(self, event_type, category):
        """Helper method to broadcast category events"""
        try:
            restaurant_id = category.restaurant.id
            data = CategorySerializer(category).data
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant_id}",
                {"type": event_type, "category": data}
            )
        except Exception as e:
            print(f"CategoryViewSet.send_ws_event error (non-fatal): {e}")

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request, pk=None):
        category = self.get_object()
        if category.parent_category_id is not None:
            raise ValidationError("Use the sub-category endpoint to reorder this category.")
        self._move_within_siblings(category, request.data.get("direction"))
        return Response(CategorySerializer(category).data, status=status.HTTP_200_OK)

    @staticmethod
    def _move_within_siblings(category, direction):
        if direction not in {"up", "down"}:
            raise ValidationError({"direction": "Direction must be 'up' or 'down'."})

        with transaction.atomic():
            siblings = list(
                Category.objects.select_for_update()
                .filter(
                    restaurant_id=category.restaurant_id,
                    parent_category_id=category.parent_category_id,
                )
                .order_by("display_order", "id")
            )
            for index, sibling in enumerate(siblings):
                if sibling.display_order != index:
                    Category.objects.filter(pk=sibling.pk).update(display_order=index)
                    sibling.display_order = index

            current_index = next(
                (index for index, sibling in enumerate(siblings) if sibling.pk == category.pk),
                None,
            )
            if current_index is None:
                raise ValidationError("Category could not be reordered.")

            target_index = current_index - 1 if direction == "up" else current_index + 1
            if target_index < 0 or target_index >= len(siblings):
                category.display_order = current_index
                return

            target = siblings[target_index]
            Category.objects.filter(pk=category.pk).update(display_order=target_index)
            Category.objects.filter(pk=target.pk).update(display_order=current_index)
            category.display_order = target_index

class SubCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = SubCategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerChefOrStaff]
    pagination_class = None

    def get_queryset(self):
        try:
            ensure_category_schema()
            user = self.request.user
            role = getattr(user, 'role', None)
            
            # Return only subcategories (level > 0)
            if role == 'owner':
                return Category.objects.filter(restaurant__owner=user, level__gt=0).order_by("parent_category_id", "display_order", "id")
            elif role in ['chef', 'staff', 'manager']:
                restaurant_ids = ChefStaff.objects.filter(
                    user=user,
                    action='accepted'
                ).values_list('restaurant_id', flat=True)
                return Category.objects.filter(restaurant_id__in=restaurant_ids, level__gt=0).order_by("parent_category_id", "display_order", "id")
            
            return Category.objects.none()
        except Exception as e:
            print(f"SubCategoryViewSet.get_queryset error: {e}")
            import traceback
            traceback.print_exc()
            return Category.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        role = getattr(user, 'role', None)
        if role == 'owner':
            restaurant = Restaurant.objects.filter(owner=user).first()
        elif role in ['chef', 'staff', 'manager']:
            cs = ChefStaff.objects.filter(user=user, action='accepted').first()
            restaurant = cs.restaurant if cs else None
        else:
            restaurant = None
        if not restaurant:
            raise ValidationError("You don't have a restaurant yet.")

        parent_category = serializer.validated_data.get("parent_category")
        next_order = (
            Category.objects.filter(
                restaurant=restaurant,
                parent_category=parent_category,
            )
            .aggregate(max_order=Max("display_order"))["max_order"]
        )
        category = serializer.save(
            restaurant=restaurant,
            display_order=0 if next_order is None else next_order + 1,
        )
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant.id}",
                {"type": "subcategory_created", "category": CategorySerializer(category).data}
            )
        except Exception as e:
            print(f"SubCategoryViewSet WS broadcast error (non-fatal): {e}")

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request, pk=None):
        category = self.get_object()
        CategoryViewSet._move_within_siblings(category, request.data.get("direction"))
        return Response(SubCategorySerializer(category).data, status=status.HTTP_200_OK)





class CustomerCategoryListView(generics.ListAPIView):
    serializer_class = CustomerCategorySerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        try:
            ensure_category_schema()
            user = self.request.user
            
            # Allow anonymous access for customer-facing endpoint
            # Return categories from first restaurant for anonymous users
            if user.is_anonymous:
                restaurant_id = self.request.query_params.get('restaurant_id')
                if restaurant_id:
                    return Category.objects.filter(restaurant_id=restaurant_id)

                first_restaurant = Restaurant.objects.first()
                if first_restaurant:
                    return Category.objects.filter(restaurant=first_restaurant)
                return Category.objects.none()

            # Only allow customers
            role = getattr(user, 'role', None)
            if role != 'customer':
                # Don't raise - just return empty
                return Category.objects.none()

            # Find restaurant via Device model
            device = user.devices.first()
            if not device or not device.restaurant:
                # Don't raise - just return empty
                return Category.objects.none()

            return Category.objects.filter(restaurant=device.restaurant)
        except Exception as e:
            print(f"CustomerCategoryListView.get_queryset error: {e}")
            import traceback
            traceback.print_exc()
            return Category.objects.none()
    



class ChefOrStaffRestaurantCategoriesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsChefOrStaff]
    pagination_class=None

    def get(self, request):
        try:
            user = request.user
            restaurant_ids = ChefStaff.objects.filter(user=user).values_list('restaurant_id', flat=True)
            categories = Category.objects.filter(restaurant_id__in=restaurant_ids)
            serializer = CategorySerializer(categories, many=True)
            return Response(serializer.data)
        except Exception as e:
            print(f"ChefOrStaffRestaurantCategoriesView error: {e}")
            import traceback
            traceback.print_exc()
            return Response([])
