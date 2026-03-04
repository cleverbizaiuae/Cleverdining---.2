from rest_framework import viewsets, permissions
from rest_framework.exceptions import ValidationError, PermissionDenied
from .models import Item
from .serializers import ItemSerializer
from accounts.permissions import IsOwnerRole,IsStaffRole,IsChefRole,IsCustomerRole,IsOwnerChefOrStaff
from .pagination import ItemPagination
from .filters import ItemFilter
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters
from restaurant.models import Restaurant
from accounts.models import ChefStaff
from .permissions import IsStafforChefOfRestaurant
from device.models import Device
from rest_framework.exceptions import PermissionDenied
from order.models import Order
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Sum, F
from order.models import OrderItem
from restaurant.models import Restaurant
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

channel_layer = get_channel_layer()



class ItemViewSet(viewsets.ModelViewSet):
    serializer_class = ItemSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerChefOrStaff]
    pagination_class = ItemPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter,filters.OrderingFilter]
    filterset_class = ItemFilter
    ordering_fields = ['created_time']
    ordering = ['-created_time']
    search_fields = ['item_name', 'category__Category_name']

    def get_queryset(self):
        try:
            user = self.request.user
            role = getattr(user, 'role', None)
            
            # Optimized: Use select_related to avoid N+1 queries
            base_qs = Item.objects.select_related('category', 'restaurant', 'sub_category')
            
            if role == 'owner':
                return base_qs.filter(restaurant__owner=user)
            elif role in ['chef', 'staff', 'manager']:
                restaurant_ids = ChefStaff.objects.filter(
                    user=user,
                    action='accepted'
                ).values_list('restaurant_id', flat=True)
                return base_qs.filter(restaurant_id__in=restaurant_ids)
            return Item.objects.none()
        except Exception as e:
            print(f"ItemViewSet.get_queryset error: {e}")
            import traceback
            traceback.print_exc()
            return Item.objects.none()

    def list(self, request, *args, **kwargs):
        """Override list to ensure it never crashes."""
        try:
            return super().list(request, *args, **kwargs)
        except Exception as e:
            print(f"ItemViewSet.list error: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'count': 0,
                'next': None,
                'previous': None,
                'results': []
            })

    def perform_create(self, serializer):
        try:
            user = self.request.user
            role = getattr(user, 'role', None)

            if role == 'owner':
                restaurant = Restaurant.objects.filter(owner=user).first()
                if not restaurant:
                    raise ValidationError("You do not own a restaurant.")
            elif role in ['chef', 'staff', 'manager']:
                chef_staff = ChefStaff.objects.filter(
                    user=user,
                    action='accepted'
                ).first()
                if not chef_staff:
                    raise ValidationError("You are not associated with any accepted restaurant.")
                restaurant = chef_staff.restaurant
            else:
                raise PermissionDenied("You are not authorized to add items.")

            item = serializer.save(restaurant=restaurant)
            self.send_ws_event("item_created", item)
        except (ValidationError, PermissionDenied):
            raise
        except Exception as e:
            print(f"ItemViewSet.perform_create error: {e}")
            raise ValidationError(f"Failed to create item: {str(e)}")

    def is_user_authorized(self, item):
        try:
            user = self.request.user
            if item.restaurant.owner == user:
                return True
            role = getattr(user, 'role', None)
            if role in ['chef', 'staff', 'manager']:
                return ChefStaff.objects.filter(
                    user=user,
                    restaurant=item.restaurant,
                    action='accepted'
                ).exists()
            return False
        except Exception as e:
            print(f"ItemViewSet.is_user_authorized error: {e}")
            return False

    def perform_update(self, serializer):
        try:
            item = self.get_object()
            if not self.is_user_authorized(item):
                raise PermissionDenied("You don't have permission to update this item.")
            item = serializer.save()
            self.send_ws_event("item_updated", item)
        except PermissionDenied:
            raise
        except Exception as e:
            print(f"ItemViewSet.perform_update error: {e}")
            raise PermissionDenied(f"Failed to update item: {str(e)}")

    def perform_destroy(self, instance):
        if not self.is_user_authorized(instance):
            raise PermissionDenied("You don't have permission to delete this item.")
        
        restaurant_id = instance.restaurant.id
        item_id = instance.id
        instance.delete()
        
        # Broadcast WebSocket event — must never block the delete response
        try:
            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant_id}",
                {
                    "type": "item_deleted",
                    "item_id": item_id
                }
            )
        except Exception as ws_err:
            print(f"ItemViewSet.perform_destroy WS broadcast error (non-fatal): {ws_err}")
    
    def send_ws_event(self, event_type, item):
        """Helper method to broadcast item events"""
        try:
            restaurant_id = item.restaurant.id
            data = ItemSerializer(item).data

            async_to_sync(channel_layer.group_send)(
                f"restaurant_{restaurant_id}",
                {
                    "type": event_type,
                    "item": data
                }
            )
        except Exception as e:
            print(f"ItemViewSet.send_ws_event error: {e}")







class StaffItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all()
    permission_classes = [permissions.IsAuthenticated, IsStaffRole]
    serializer_class = ItemSerializer
    pagination_class = ItemPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = ItemFilter
    search_fields = ['item_name', 'category__Category_name']

    def get_queryset(self):
        # Return only items from the restaurant the staff is assigned to
        try:
            chef_staff = ChefStaff.objects.get(user=self.request.user)
            return Item.objects.filter(restaurant=chef_staff.restaurant).order_by('-created_time')
        except ChefStaff.DoesNotExist:
            return Item.objects.none()
    def send_ws_event(self, event_type, item=None, item_id=None):
        """Broadcast update/delete events to WebSocket"""
        restaurant_id = item.restaurant.id if item else None
        data = ItemSerializer(item).data if item else None

        async_to_sync(channel_layer.group_send)(
            f"restaurant_{restaurant_id}",
            {
                "type": event_type, 
                "item": data,
            }
        )

    def perform_update(self, serializer):
        if not IsStafforChefOfRestaurant().has_object_permission(self.request, self, serializer.instance):
            raise PermissionDenied("You are not authorized to update this item.")
        item = serializer.save()
        self.send_ws_event("item_updated", item=item)

    def perform_destroy(self, instance):
        if not IsStafforChefOfRestaurant().has_object_permission(self.request, self, instance):
            raise PermissionDenied("You are not authorized to delete this item.")
        restaurant_id = instance.restaurant.id
        item_id = instance.id
        instance.delete()
        self.send_ws_event("item_deleted", item_id=item_id)

    

    @action(detail=False,methods=['get'],url_path='status-summary')
    def status_summary(self,request):
        try:
            cheff_staff = ChefStaff.objects.get(user = request.user)
            restaurant = cheff_staff.restaurant
            available_items_count = Item.objects.filter(restaurant=restaurant,availability=True).count()
            preparing_order_count =  Order.objects.filter(restaurant= restaurant,status ='preparing').count()
            pending_order_count = Order.objects.filter(restaurant=restaurant, status='pending').count()
            return Response(
                {
                    "available_items_count": available_items_count,
                    "preparing_order_count": preparing_order_count,
                    "pending_order_count": pending_order_count
                }
            )
        except ChefStaff.DoesNotExist:
            return Response({
                "error": "Chef staff not found."
            }, status=403)





class ChefItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all()
    permission_classes = [permissions.IsAuthenticated,IsChefRole]
    serializer_class = ItemSerializer
    pagination_class = ItemPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = ItemFilter
    search_fields = ['item_name', 'category__Category_name']

    def get_queryset(self):
        # Return only items from the restaurant the staff is assigned to
        try:
            chef_staff = ChefStaff.objects.get(user=self.request.user)
            return Item.objects.filter(restaurant=chef_staff.restaurant).order_by('-created_time')
        except ChefStaff.DoesNotExist:
            return Item.objects.none()
        
    def send_ws_event(self, event_type, item=None, item_id=None):
        """Broadcast update/delete events to WebSocket"""
        restaurant_id = item.restaurant.id if item else None
        data = ItemSerializer(item).data if item else None

        async_to_sync(channel_layer.group_send)(
            f"restaurant_{restaurant_id}",
            {
                "type": event_type,   # Must match method in consumer
                "item": data,
            }
        )

    def perform_update(self, serializer):
        if not IsStafforChefOfRestaurant().has_object_permission(self.request, self, serializer.instance):
            raise PermissionDenied("You are not authorized to update this item.")
        item = serializer.save()
        self.send_ws_event("item_updated", item=item)

    def perform_destroy(self, instance):
        if not IsStafforChefOfRestaurant().has_object_permission(self.request, self, instance):
            raise PermissionDenied("You are not authorized to delete this item.")
        restaurant_id = instance.restaurant.id
        item_id = instance.id
        instance.delete()
        self.send_ws_event("item_deleted", item_id=item_id)

    
    @action(detail=False,methods=['get'],url_path='status-summary')
    def status_summary(self,request):
        try:
            cheff_staff = ChefStaff.objects.get(user = request.user)
            restaurant = cheff_staff.restaurant
            available_items_count = Item.objects.filter(restaurant=restaurant,availability=True).count()
            preparing_order_count =  Order.objects.filter(restaurant= restaurant,status ='preparing').count()
            pending_order_count = Order.objects.filter(restaurant=restaurant, status='pending').count()
            return Response(
                {
                    "available_items_count": available_items_count,
                    "preparing_order_count": preparing_order_count,
                    "pending_order_count": pending_order_count
                }
            )
        except ChefStaff.DoesNotExist:
            return Response({
                "error": "Chef staff not found."
            }, status=403)





class CustomerItemViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ItemSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = ItemPagination  
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = ItemFilter  
    search_fields = ['item_name', 'category__Category_name']

    def get_queryset(self):
        # Optimized: Use select_related to avoid N+1 queries for category and restaurant
        # Filter only available items for customer-facing endpoint
        base_qs = Item.objects.select_related('category', 'restaurant', 'sub_category').filter(availability=True)
        
        # Allow anonymous access for customer-facing endpoint
        if self.action == 'retrieve':
            return base_qs.all()

        # Return items from first restaurant for anonymous users
        if self.request.user.is_anonymous:
            restaurant_id = self.request.query_params.get('restaurant_id')
            if restaurant_id:
                return base_qs.filter(restaurant_id=restaurant_id)
            
            first_restaurant = Restaurant.objects.first()
            if first_restaurant:
                return base_qs.filter(restaurant=first_restaurant)
            return Item.objects.none()
        
        restaurant_ids = self.request.user.devices.values_list('restaurant_id', flat=True)
        val=list(restaurant_ids)
        return base_qs.filter(restaurant_id__in=val)





class MostSellingItemsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsOwnerChefOrStaff]

    def get(self, request):
        user = request.user
        restaurant_ids = []
        if getattr(user, 'role', '') == 'owner':
            restaurant_ids = Restaurant.objects.filter(owner=user).values_list('id', flat=True)
        elif getattr(user, 'role', '') in ['manager', 'staff', 'chef']:
            restaurant_ids = ChefStaff.objects.filter(
                user=user,
                action='accepted'
            ).values_list('restaurant_id', flat=True)

        if not restaurant_ids:
             return Response([])

        # Optimised: Aggregate in DB, Limit to Top 6
        top_items = (
            OrderItem.objects
            .filter(order__restaurant_id__in=restaurant_ids)
            .values(item_name=F('item__item_name'))
            .annotate(total_quantity=Sum('quantity'))
            .order_by('-total_quantity')[:6]
        )

        total_quantity_all = sum(item['total_quantity'] for item in top_items) or 1 # Avoid div/0

        data = [
            {
                "item_name": item['item_name'],
                "total_quantity_sold": item['total_quantity'],
                "percentage": round((item['total_quantity'] / total_quantity_all) * 100, 2)
            }
            for item in top_items
        ]

        return Response(data)






