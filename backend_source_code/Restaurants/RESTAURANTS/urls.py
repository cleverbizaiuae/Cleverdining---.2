"""
URL configuration for RESTAURANTS project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path,include
from django.conf import settings
from django.conf.urls.static import static
from .health_views import health_check
from restaurant.views import BrandConfigAPIView
from customer.compat_views import DailyStatsAPIView, LeadsAPIView, SalesAnalyticsAPIView, TableMessagesAPIView
from adminapi.views import IntegrationAPIView, IntegrationDetailAPIView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', health_check),
    path('api/health/', health_check),
    path('api/daily-stats', DailyStatsAPIView.as_view()),
    path('api/daily-stats/', DailyStatsAPIView.as_view()),
    path('api/analytics/sales', SalesAnalyticsAPIView.as_view()),
    path('api/analytics/sales/', SalesAnalyticsAPIView.as_view()),
    path('api/leads/<str:identifier>', LeadsAPIView.as_view()),
    path('api/leads/<str:identifier>/', LeadsAPIView.as_view()),
    path('api/table-messages', TableMessagesAPIView.as_view()),
    path('api/table-messages/', TableMessagesAPIView.as_view()),
    path('api/table-messages/<str:identifier>', TableMessagesAPIView.as_view()),
    path('api/table-messages/<str:identifier>/', TableMessagesAPIView.as_view()),
    path('api/brand-config', BrandConfigAPIView.as_view()),
    path('api/integrations', IntegrationAPIView.as_view()),
    path('api/integrations/', IntegrationAPIView.as_view()),
    path('api/integrations/<uuid:pk>', IntegrationDetailAPIView.as_view()),
    path('api/integrations/<uuid:pk>/', IntegrationDetailAPIView.as_view()),
    path('api/integrations/', include('integrations.urls')),
    path('api/brand-config/', BrandConfigAPIView.as_view()),
    path('api/', include('customer.intelligence_urls')),
    path('', include('accounts.urls')),
    path('adminapi/', include('adminapi.urls')),
    path('owners/', include('owners.urls')), # Main Restaurant Owner API
    path('api/staff/', include('staff.urls')),
    path('api/chef/', include('chef.urls')),
    path('api/customer/', include('customer.urls')),
    path('api/reviews/', include('review.urls')),
    # path('api/payments/', include('payment.urls')),
    path('message/', include('message.urls')),
    path('api/upsell/', include('order.upsell_urls')),
    path('vapi/', include('vapi.urls')),
    path('subscription/', include('subscription.urls')),
]


from django.urls import re_path
from core.media_views import cached_media_serve

urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', cached_media_serve, {'document_root': settings.MEDIA_ROOT}),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
