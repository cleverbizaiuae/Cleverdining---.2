from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from order.models import Order
from restaurant.models import Restaurant

from .models import Customer, CustomerRestaurantLink, GameScore, LoyaltyTransaction
from .schema_guard import ensure_customer_intelligence_schema


def _pick(data, *keys, default=None):
    for key in keys:
        value = data.get(key)
        if value is not None:
            return value
    return default


def _restaurant_from_value(value):
    if value in (None, ""):
        return None
    return Restaurant.objects.filter(pk=value).first()


def _money(value):
    try:
        return Decimal(str(value or "0")).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0.00")


def _points(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _compute_tier(lifetime_points: int) -> str:
    if lifetime_points >= 5000:
        return "platinum"
    if lifetime_points >= 2000:
        return "gold"
    if lifetime_points >= 500:
        return "silver"
    return "bronze"


def _customer_payload(customer: Customer):
    return {
        "id": str(customer.id),
        "phone": customer.phone,
        "name": customer.name,
        "email": customer.email,
        "restaurantId": str(customer.restaurant_id) if customer.restaurant_id else None,
        "loyaltyPoints": customer.loyalty_points,
        "lifetimePoints": customer.lifetime_points,
        "totalSpent": str(customer.total_spent),
        "totalOrders": customer.total_orders,
        "tier": customer.tier,
        "notes": customer.notes,
        "createdAt": customer.created_at.isoformat() if customer.created_at else None,
        "updatedAt": customer.updated_at.isoformat() if customer.updated_at else None,
    }


def _restaurant_link_payload(link: CustomerRestaurantLink):
    return {
        "id": str(link.id),
        "customerId": str(link.customer_id),
        "restaurantId": str(link.restaurant_id),
        "restaurantName": link.restaurant_name or link.restaurant.resturent_name,
        "visitCount": link.visit_count,
        "totalSpent": str(link.total_spent),
        "firstVisit": link.first_visit.isoformat() if link.first_visit else None,
        "lastVisit": link.last_visit.isoformat() if link.last_visit else None,
    }


def _loyalty_transaction_payload(entry: LoyaltyTransaction):
    return {
        "id": str(entry.id),
        "customerId": str(entry.customer_id),
        "restaurantId": str(entry.restaurant_id) if entry.restaurant_id else None,
        "restaurantName": entry.restaurant_name,
        "orderId": str(entry.order_id) if entry.order_id else None,
        "points": entry.points,
        "type": entry.type,
        "description": entry.description,
        "createdAt": entry.created_at.isoformat() if entry.created_at else None,
    }


def _game_score_payload(score: GameScore):
    return {
        "id": str(score.id),
        "playerName": score.player_name,
        "phone": score.phone,
        "customerId": str(score.customer_id) if score.customer_id else None,
        "gameType": score.game_type,
        "score": score.score,
        "restaurantId": str(score.restaurant_id) if score.restaurant_id else None,
        "createdAt": score.created_at.isoformat() if score.created_at else None,
    }


def _touch_restaurant_link(customer: Customer, restaurant: Restaurant | None):
    if not restaurant:
        return None
    link, created = CustomerRestaurantLink.objects.select_for_update().get_or_create(
        customer=customer,
        restaurant=restaurant,
        defaults={
            "restaurant_name": restaurant.resturent_name,
        },
    )
    if not created:
        link.visit_count += 1
        link.restaurant_name = restaurant.resturent_name
        link.last_visit = timezone.now()
        link.save(update_fields=["visit_count", "restaurant_name", "last_visit"])
    return link


def lookup_or_create_customer(phone: str, name: str, restaurant: Restaurant | None):
    normalized_phone = str(phone or "").strip()
    normalized_name = str(name or "Guest").strip() or "Guest"
    if not normalized_phone:
        raise ValueError("phone is required")

    customer = Customer.objects.select_for_update().filter(phone=normalized_phone).first()
    if customer:
        fields_to_update = []
        if normalized_name != "Guest" and customer.name == "Guest":
            customer.name = normalized_name
            fields_to_update.append("name")
        if restaurant and not customer.restaurant_id:
            customer.restaurant = restaurant
            fields_to_update.append("restaurant")
        if fields_to_update:
            fields_to_update.append("updated_at")
            customer.save(update_fields=fields_to_update)
        _touch_restaurant_link(customer, restaurant)
        return customer, False

    customer = Customer.objects.create(
        phone=normalized_phone,
        name=normalized_name,
        restaurant=restaurant,
        tier=_compute_tier(0),
    )
    _touch_restaurant_link(customer, restaurant)
    return customer, True


def earn_points(
    customer: Customer,
    points: int,
    *,
    restaurant: Restaurant | None,
    description: str,
    transaction_type: str,
    order: Order | None = None,
    amount: Decimal | None = None,
    count_order: bool = False,
):
    customer.loyalty_points += points
    customer.lifetime_points += max(points, 0)
    customer.tier = _compute_tier(customer.lifetime_points)
    if count_order:
        customer.total_orders += 1
        customer.total_spent += amount or Decimal("0.00")
    customer.save(
        update_fields=[
            "loyalty_points",
            "lifetime_points",
            "tier",
            "total_orders",
            "total_spent",
            "updated_at",
        ]
    )

    if restaurant and count_order:
        link = CustomerRestaurantLink.objects.select_for_update().filter(
            customer=customer,
            restaurant=restaurant,
        ).first()
        if link:
            link.total_spent += amount or Decimal("0.00")
            link.save(update_fields=["total_spent", "last_visit"])

    return LoyaltyTransaction.objects.create(
        customer=customer,
        restaurant=restaurant,
        restaurant_name=restaurant.resturent_name if restaurant else None,
        order=order,
        points=points,
        type=transaction_type,
        description=description,
    )


class CrmCustomerListAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        ensure_customer_intelligence_schema()
        restaurant_id = request.query_params.get("restaurantId") or request.query_params.get("restaurant_id")
        queryset = Customer.objects.select_related("restaurant").order_by("-created_at")
        if restaurant_id:
            queryset = queryset.filter(restaurant_id=restaurant_id)
        return Response([_customer_payload(customer) for customer in queryset], status=status.HTTP_200_OK)


class SuperCrmCustomerListAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        ensure_customer_intelligence_schema()
        customers = Customer.objects.select_related("restaurant").order_by("-created_at")
        links = CustomerRestaurantLink.objects.select_related("restaurant").filter(
            customer_id__in=[customer.id for customer in customers]
        ).order_by("-last_visit")
        links_by_customer: dict[str, list[dict]] = {}
        for link in links:
            links_by_customer.setdefault(str(link.customer_id), []).append(_restaurant_link_payload(link))

        payload = []
        for customer in customers:
            row = _customer_payload(customer)
            row["restaurantLinks"] = links_by_customer.get(str(customer.id), [])
            payload.append(row)
        return Response(payload, status=status.HTTP_200_OK)


class CrmCustomerDetailAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, customer_id):
        ensure_customer_intelligence_schema()
        customer = get_object_or_404(Customer.objects.select_related("restaurant"), pk=customer_id)
        restaurant_links = CustomerRestaurantLink.objects.select_related("restaurant").filter(customer=customer).order_by("-last_visit")
        loyalty_transactions = LoyaltyTransaction.objects.filter(customer=customer).order_by("-created_at")
        payload = _customer_payload(customer)
        payload["restaurantLinks"] = [_restaurant_link_payload(link) for link in restaurant_links]
        payload["loyaltyTransactions"] = [_loyalty_transaction_payload(entry) for entry in loyalty_transactions]
        return Response(payload, status=status.HTTP_200_OK)

    def patch(self, request, customer_id):
        ensure_customer_intelligence_schema()
        customer = get_object_or_404(Customer, pk=customer_id)
        allowed_fields = {
            "notes": "notes",
            "name": "name",
            "email": "email",
        }
        fields_to_update = []
        for incoming, field_name in allowed_fields.items():
            if incoming not in request.data:
                continue
            setattr(customer, field_name, request.data.get(incoming))
            fields_to_update.append(field_name)
        if fields_to_update:
            fields_to_update.append("updated_at")
            customer.save(update_fields=fields_to_update)
        return Response(_customer_payload(customer), status=status.HTTP_200_OK)


class LoyaltyEarnAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ensure_customer_intelligence_schema()
        phone = str(_pick(request.data, "phone", default="") or "").strip()
        name = str(_pick(request.data, "name", "playerName", default="Guest") or "Guest").strip() or "Guest"
        points = _points(_pick(request.data, "points", default=0))
        if not phone or points <= 0:
            return Response({"error": "phone and positive points are required"}, status=status.HTTP_400_BAD_REQUEST)

        restaurant = _restaurant_from_value(_pick(request.data, "restaurantId", "restaurant_id"))
        order_id = _pick(request.data, "orderId", "order_id")
        order = Order.objects.filter(pk=order_id).first() if order_id else None
        amount = _money(_pick(request.data, "amount", "total", default=0))
        description = str(_pick(request.data, "description", default=f"Earned {points} loyalty points") or "").strip()

        with transaction.atomic():
            customer, is_new = lookup_or_create_customer(phone, name, restaurant)
            entry = earn_points(
                customer,
                points,
                restaurant=restaurant,
                description=description,
                transaction_type="earn_order",
                order=order,
                amount=amount,
                count_order=bool(order_id or amount > 0),
            )

        return Response(
            {
                "customer": _customer_payload(customer),
                "transaction": _loyalty_transaction_payload(entry),
                "isNew": is_new,
            },
            status=status.HTTP_201_CREATED if is_new else status.HTTP_200_OK,
        )


class LoyaltyRedeemAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ensure_customer_intelligence_schema()
        customer_id = _pick(request.data, "customerId", "customer_id")
        phone = str(_pick(request.data, "phone", default="") or "").strip()
        points = _points(_pick(request.data, "points", default=0))
        if points <= 0:
            return Response({"error": "positive points are required"}, status=status.HTTP_400_BAD_REQUEST)

        customer = Customer.objects.filter(pk=customer_id).first() if customer_id else Customer.objects.filter(phone=phone).first()
        if not customer:
            return Response({"error": "customer not found"}, status=status.HTTP_404_NOT_FOUND)
        if customer.loyalty_points < points:
            return Response({"error": "insufficient points"}, status=status.HTTP_400_BAD_REQUEST)

        restaurant = _restaurant_from_value(_pick(request.data, "restaurantId", "restaurant_id"))
        description = str(_pick(request.data, "description", default=f"Redeemed {points} loyalty points") or "").strip()
        with transaction.atomic():
            customer = Customer.objects.select_for_update().get(pk=customer.pk)
            customer.loyalty_points -= points
            customer.save(update_fields=["loyalty_points", "updated_at"])
            entry = LoyaltyTransaction.objects.create(
                customer=customer,
                restaurant=restaurant,
                restaurant_name=restaurant.resturent_name if restaurant else None,
                points=-points,
                type="redeem",
                description=description,
            )
        discount_value = (Decimal(points) / Decimal("100")) * Decimal("5")
        return Response(
            {
                "customer": _customer_payload(customer),
                "transaction": _loyalty_transaction_payload(entry),
                "discountValue": str(discount_value.quantize(Decimal("0.01"))),
            },
            status=status.HTTP_200_OK,
        )


class LoyaltyHistoryAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, customer_id):
        ensure_customer_intelligence_schema()
        customer = get_object_or_404(Customer, pk=customer_id)
        entries = LoyaltyTransaction.objects.filter(customer=customer).order_by("-created_at")
        return Response([_loyalty_transaction_payload(entry) for entry in entries], status=status.HTTP_200_OK)


class GameScoreAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ensure_customer_intelligence_schema()
        player_name = str(_pick(request.data, "playerName", "player_name", default="Guest") or "Guest").strip() or "Guest"
        phone = str(_pick(request.data, "phone", default="") or "").strip()
        score_value = max(0, _points(_pick(request.data, "score", default=0)))
        game_type = str(_pick(request.data, "gameType", "game_type", default="snake") or "snake").strip() or "snake"
        restaurant = _restaurant_from_value(_pick(request.data, "restaurantId", "restaurant_id"))

        with transaction.atomic():
            score = GameScore.objects.create(
                player_name=player_name,
                phone=phone or None,
                score=score_value,
                game_type=game_type,
                restaurant=restaurant,
            )
            if phone and len(phone) >= 8:
                customer, _ = lookup_or_create_customer(phone, player_name, restaurant)
                score.customer = customer
                score.save(update_fields=["customer"])
                bonus_points = 10 + min(50, (score_value // 100) * 5)
                earn_points(
                    customer,
                    bonus_points,
                    restaurant=restaurant,
                    description=f"Game bonus: {score_value} points in {game_type}",
                    transaction_type="earn_game",
                )

        return Response(_game_score_payload(score), status=status.HTTP_201_CREATED)


class GameLeaderboardAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        ensure_customer_intelligence_schema()
        queryset = GameScore.objects.select_related("customer", "restaurant").order_by("-score", "-created_at")
        game_type = request.query_params.get("gameType") or request.query_params.get("game_type")
        if game_type:
            queryset = queryset.filter(game_type=game_type)
        limit = min(max(_points(request.query_params.get("limit", 50)), 1), 200)
        return Response([_game_score_payload(score) for score in queryset[:limit]], status=status.HTTP_200_OK)
