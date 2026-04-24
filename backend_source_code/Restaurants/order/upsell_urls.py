from django.urls import path

from .upsell_views import (
    UpsellAnalyticsAPIView,
    UpsellAssociationStatsAPIView,
    UpsellEventCreateAPIView,
    UpsellEventsByTableAPIView,
    UpsellItemsAPIView,
    UpsellPairingIntelligenceAPIView,
    UpsellRuleDeleteAPIView,
    UpsellRulesAPIView,
    UpsellSettingsAPIView,
    UpsellSmartSuggestionsAPIView,
)


urlpatterns = [
    path("settings", UpsellSettingsAPIView.as_view(), name="upsell-settings"),
    path("rules", UpsellRulesAPIView.as_view(), name="upsell-rules"),
    path("rules/<int:pk>", UpsellRuleDeleteAPIView.as_view(), name="upsell-rule-delete"),
    path("events", UpsellEventCreateAPIView.as_view(), name="upsell-events"),
    path("association-stats", UpsellAssociationStatsAPIView.as_view(), name="upsell-association-stats"),
    path("analytics", UpsellAnalyticsAPIView.as_view(), name="upsell-analytics"),
    path("events/by-table", UpsellEventsByTableAPIView.as_view(), name="upsell-events-by-table"),
    path("items", UpsellItemsAPIView.as_view(), name="upsell-items"),
    path("pairing-intelligence", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-pairing-intelligence"),
    # Compatibility aliases with the reference AI-upsell implementation.
    path("association-analytics", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-association-analytics"),
    path("compute-associations", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-compute-associations"),
    path("smart-suggestions", UpsellSmartSuggestionsAPIView.as_view(), name="upsell-smart-suggestions"),
]
