from django.urls import path

from .views import (
    CrmCustomerDetailAPIView,
    CrmCustomerListAPIView,
    GameLeaderboardAPIView,
    GameScoreAPIView,
    LoyaltyEarnAPIView,
    LoyaltyHistoryAPIView,
    LoyaltyRedeemAPIView,
)

urlpatterns = [
    path("crm/customers", CrmCustomerListAPIView.as_view(), name="crm-customers"),
    path("crm/customers/", CrmCustomerListAPIView.as_view(), name="crm-customers-slash"),
    path("crm/customers/<uuid:customer_id>", CrmCustomerDetailAPIView.as_view(), name="crm-customer-detail"),
    path("crm/customers/<uuid:customer_id>/", CrmCustomerDetailAPIView.as_view(), name="crm-customer-detail-slash"),
    path("loyalty/earn", LoyaltyEarnAPIView.as_view(), name="loyalty-earn"),
    path("loyalty/earn/", LoyaltyEarnAPIView.as_view(), name="loyalty-earn-slash"),
    path("loyalty/redeem", LoyaltyRedeemAPIView.as_view(), name="loyalty-redeem"),
    path("loyalty/redeem/", LoyaltyRedeemAPIView.as_view(), name="loyalty-redeem-slash"),
    path("loyalty/<uuid:customer_id>", LoyaltyHistoryAPIView.as_view(), name="loyalty-history"),
    path("loyalty/<uuid:customer_id>/", LoyaltyHistoryAPIView.as_view(), name="loyalty-history-slash"),
    path("game/score", GameScoreAPIView.as_view(), name="game-score"),
    path("game/score/", GameScoreAPIView.as_view(), name="game-score-slash"),
    path("game/leaderboard", GameLeaderboardAPIView.as_view(), name="game-leaderboard"),
    path("game/leaderboard/", GameLeaderboardAPIView.as_view(), name="game-leaderboard-slash"),
]
