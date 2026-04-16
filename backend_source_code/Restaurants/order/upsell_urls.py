from django.urls import path

from .upsell_views import (
    UpsellAnalyticsAPIView,
    UpsellEventCreateAPIView,
    UpsellEventsByTableAPIView,
    UpsellRuleDeleteAPIView,
    UpsellRulesAPIView,
    UpsellSettingsAPIView,
)


urlpatterns = [
    path("settings", UpsellSettingsAPIView.as_view(), name="upsell-settings"),
    path("rules", UpsellRulesAPIView.as_view(), name="upsell-rules"),
    path("rules/<int:pk>", UpsellRuleDeleteAPIView.as_view(), name="upsell-rule-delete"),
    path("events", UpsellEventCreateAPIView.as_view(), name="upsell-events"),
    path("analytics", UpsellAnalyticsAPIView.as_view(), name="upsell-analytics"),
    path("events/by-table", UpsellEventsByTableAPIView.as_view(), name="upsell-events-by-table"),
]
