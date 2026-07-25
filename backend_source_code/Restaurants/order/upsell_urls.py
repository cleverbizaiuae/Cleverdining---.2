from django.urls import path

from .upsell_views import (
    UpsellAnalyticsAPIView,
    UpsellAssociationStatsAPIView,
    UpsellEventCreateAPIView,
    UpsellEventsByTableAPIView,
    UpsellItemsAPIView,
    UpsellPairingIntelligenceAPIView,
    UpsellApplyPairingsAPIView,
    UpsellRuleDeleteAPIView,
    UpsellRulesAPIView,
    UpsellSettingsAPIView,
    UpsellSmartSuggestionsAPIView,
)


urlpatterns = [
    path("settings", UpsellSettingsAPIView.as_view(), name="upsell-settings"),
    path("settings/", UpsellSettingsAPIView.as_view(), name="upsell-settings-slash"),
    path("rules", UpsellRulesAPIView.as_view(), name="upsell-rules"),
    path("rules/", UpsellRulesAPIView.as_view(), name="upsell-rules-slash"),
    path("rules/<int:pk>", UpsellRuleDeleteAPIView.as_view(), name="upsell-rule-delete"),
    path("rules/<int:pk>/", UpsellRuleDeleteAPIView.as_view(), name="upsell-rule-delete-slash"),
    path("apply-pairings", UpsellApplyPairingsAPIView.as_view(), name="upsell-apply-pairings"),
    path("apply-pairings/", UpsellApplyPairingsAPIView.as_view(), name="upsell-apply-pairings-slash"),
    path("events", UpsellEventCreateAPIView.as_view(), name="upsell-events"),
    path("events/", UpsellEventCreateAPIView.as_view(), name="upsell-events-slash"),
    path("association-stats", UpsellAssociationStatsAPIView.as_view(), name="upsell-association-stats"),
    path("association-stats/", UpsellAssociationStatsAPIView.as_view(), name="upsell-association-stats-slash"),
    path("analytics", UpsellAnalyticsAPIView.as_view(), name="upsell-analytics"),
    path("analytics/", UpsellAnalyticsAPIView.as_view(), name="upsell-analytics-slash"),
    path("events/by-table", UpsellEventsByTableAPIView.as_view(), name="upsell-events-by-table"),
    path("events/by-table/", UpsellEventsByTableAPIView.as_view(), name="upsell-events-by-table-slash"),
    path("items", UpsellItemsAPIView.as_view(), name="upsell-items"),
    path("items/", UpsellItemsAPIView.as_view(), name="upsell-items-slash"),
    path("pairing-intelligence", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-pairing-intelligence"),
    path("pairing-intelligence/", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-pairing-intelligence-slash"),
    # Compatibility aliases with the reference AI-upsell implementation.
    path("association-analytics", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-association-analytics"),
    path("association-analytics/", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-association-analytics-slash"),
    path("compute-associations", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-compute-associations"),
    path("compute-associations/", UpsellPairingIntelligenceAPIView.as_view(), name="upsell-compute-associations-slash"),
    path("smart-suggestions", UpsellSmartSuggestionsAPIView.as_view(), name="upsell-smart-suggestions"),
    path("smart-suggestions/", UpsellSmartSuggestionsAPIView.as_view(), name="upsell-smart-suggestions-slash"),
]
