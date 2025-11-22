from django.shortcuts import render
from .serializers import RestaurantSerializer
from restaurant.models import Restaurant
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet
from rest_framework.filters import SearchFilter
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Sum, Count, F, ExpressionWrapper, fields
from datetime import timedelta
from django.utils import timezone
from order.models import Order
from django.db.models.functions import TruncMonth
from datetime import datetime
from rest_framework.pagination import PageNumberPagination

class ChefAndStaffPagination(PageNumberPagination):
    page_size = 2
    page_size_query_param ='page_size'
     


class RestaurantViewSet(ModelViewSet):
    queryset = Restaurant.objects.prefetch_related('subscriptions')
    serializer_class = RestaurantSerializer
    pagination_class = ChefAndStaffPagination
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter]  
    search_fields = ['resturent_name']

    def get_queryset(self):
        queryset = self.queryset.all()
        restaurant_name = self.request.query_params.get('restaurant_name', None)
        if restaurant_name:
            queryset = queryset.filter(resturent_name__icontains=restaurant_name)
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def summary(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        total_restaurants = queryset.count()
        total_hold_restaurants = queryset.filter(subscriptions__status='hold').count()
        total_active_restaurants = queryset.filter(subscriptions__is_active=True).count()
        response_data = {
            "total_restaurant": total_restaurants,
            "total_hold_restaurant": total_hold_restaurants,
            "total_active_restaurant": total_active_restaurants
        }

        return Response(response_data, status=status.HTTP_200_OK)
    

    @action(detail=False, methods=['get'])
    def more_summary(self, request, *args, **kwargs):
        # Get the current date and calculate last week
        today = timezone.now().date()
        last_week_start = today - timedelta(days=today.weekday() + 7)
        last_week_end = last_week_start + timedelta(days=6)

        # Query for orders in the last week
        last_week_orders = Order.objects.filter(created_time__range=[last_week_start, last_week_end])

        # Total all restaurants' order sales
        total_all_restaurant_orders = Order.objects.aggregate(total_orders=Count('id'))
        total_all_restaurant_order_sales = Order.objects.aggregate(total_sales=Sum('total_price'))

        # Last week sales
        last_week_order_sales = last_week_orders.aggregate(last_week_sales=Sum('total_price'))

        # Last week order growth (current week vs previous week)
        last_week_order_count = last_week_orders.count()
        prev_week_start = last_week_start - timedelta(days=7)
        prev_week_end = last_week_start - timedelta(days=1)
        prev_week_orders = Order.objects.filter(created_time__range=[prev_week_start, prev_week_end])
        prev_week_order_count = prev_week_orders.count()

        # Calculate growth
        growth_percentage = 0
        if prev_week_order_count > 0:
            growth_percentage = ((last_week_order_count - prev_week_order_count) / prev_week_order_count) * 100

        # Get total active restaurants count
        total_active_restaurants = Restaurant.objects.filter(subscriptions__is_active=True).count()

        response_data = {
            "total_all_restaurant_order_sells": total_all_restaurant_orders['total_orders'],
            "total_all_restaurant_order_sells_price": total_all_restaurant_order_sales['total_sales'],
            "last_week_all_order_price": last_week_order_sales['last_week_sales'],
            "last_week_all_order_growth": growth_percentage,
            "total_active_restaurant": total_active_restaurants
        }

        return Response(response_data, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'])
    def yearly_sells_report(self, request, *args, **kwargs):
        # Get the current year
        current_year = timezone.now().year

        # Get total sales and order count for each month in the current year
        monthly_sales = (
            Order.objects.filter(created_time__year=current_year)
            .annotate(month=TruncMonth('created_time'))  # Truncate to month
            .values('month')
            .annotate(total_orders=Count('id'), total_sales=Sum('total_price'))
            .order_by('month')
        )

        # Generate list of all months (1-12)
        all_months = [datetime(current_year, i, 1) for i in range(1, 13)]
        
        # Prepare response data in a readable format, ensuring all months are included
        response_data = {
            "year": current_year,
            "monthly_sales": [
                {
                    "month": month.strftime("%B"),  # Get the month name (e.g., January)
                    "total_orders": next(
                        (sales['total_orders'] for sales in monthly_sales if sales['month'].month == month.month), 0
                    ),
                    "total_sales": next(
                        (sales['total_sales'] for sales in monthly_sales if sales['month'].month == month.month), 0
                    )
                }
                for month in all_months
            ]
        }

        return Response(response_data, status=status.HTTP_200_OK)
    

    @action(detail=False, methods=['get'])
    def last_yearly_sells_report(self, request, *args, **kwargs):
        # Get the previous year
        previous_year = timezone.now().year - 1

        # Get total sales and order count for each month in the previous year
        monthly_sales = (
            Order.objects.filter(created_time__year=previous_year)
            .annotate(month=TruncMonth('created_time'))  # Truncate to month
            .values('month')
            .annotate(total_orders=Count('id'), total_sales=Sum('total_price'))
            .order_by('month')
        )

        # Generate list of all months for the previous year (1-12)
        all_months = [datetime(previous_year, i, 1) for i in range(1, 13)]
        
        # Prepare response data, ensuring all months are included
        response_data = {
            "year": previous_year,
            "monthly_sales": [
                {
                    "month": month.strftime("%B"),  # Get the month name (e.g., January)
                    "total_orders": next(
                        (sales['total_orders'] for sales in monthly_sales if sales['month'].month == month.month), 0
                    ),
                    "total_sales": next(
                        (sales['total_sales'] for sales in monthly_sales if sales['month'].month == month.month), 0
                    )
                }
                for month in all_months
            ]
        }

        return Response(response_data, status=status.HTTP_200_OK)

    




