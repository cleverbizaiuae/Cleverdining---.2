from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDay, TruncHour
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import ChefStaff
from device.models import Device
from message.models import TableMessage
from order.models import Order
from restaurant.models import Restaurant

from .models import Lead


PAID_ORDER_FILTER = Q(payment_status="paid") | Q(status__in=["completed", "delivered", "served"])


def _to_decimal(value):
    return Decimal(str(value or "0.00"))


def _restaurant_ids_for_request(request):
    restaurant_id = (
        request.query_params.get("restaurantId")
        or request.query_params.get("restaurant_id")
        or request.data.get("restaurantId")
        or request.data.get("restaurant_id")
    )
    if restaurant_id and str(restaurant_id) != "default":
        return [restaurant_id]

    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        role = getattr(user, "role", "")
        if role == "owner":
            ids = list(Restaurant.objects.filter(owner=user).values_list("id", flat=True))
            if ids:
                return ids
        if role in {"manager", "staff", "chef"}:
            staff = ChefStaff.objects.filter(user=user, action="accepted").first()
            if staff:
                return [staff.restaurant_id]

    return list(Restaurant.objects.values_list("id", flat=True))


def _order_queryset(request):
    restaurant_ids = _restaurant_ids_for_request(request)
    queryset = Order.objects.all()
    if restaurant_ids:
        queryset = queryset.filter(restaurant_id__in=restaurant_ids)
    return queryset


def _safe_datetime(value, fallback):
    parsed = parse_datetime(str(value)) if value else None
    if parsed is None:
        return fallback
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _lead_payload(lead):
    return {
        "id": str(lead.id),
        "name": lead.name,
        "phone": lead.phone,
        "source": lead.source,
        "status": lead.status,
        "notes": lead.notes,
        "tags": lead.tags if isinstance(lead.tags, list) else [],
        "restaurantId": str(lead.restaurant_id) if lead.restaurant_id else None,
        "totalReservationAttempts": lead.total_reservation_attempts,
        "totalConfirmedReservations": lead.total_confirmed_reservations,
        "firstSeen": lead.first_seen.isoformat() if lead.first_seen else None,
        "lastSeen": lead.last_seen.isoformat() if lead.last_seen else None,
        "createdAt": lead.created_at.isoformat() if lead.created_at else None,
        "updatedAt": lead.updated_at.isoformat() if lead.updated_at else None,
    }


def _table_message_payload(message):
    return {
        "id": message.id,
        "restaurantId": str(message.restaurant_id) if message.restaurant_id else None,
        "deviceId": str(message.device_id) if message.device_id else None,
        "tableNumber": message.table_number,
        "table_number": message.table_number,
        "tableName": message.table_name,
        "table_name": message.table_name,
        "type": message.type,
        "message": message.message,
        "status": message.status,
        "createdAt": message.created_at.isoformat() if message.created_at else None,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "updatedAt": message.updated_at.isoformat() if message.updated_at else None,
    }


def _ids_from_payload(data):
    raw_ids = data.get("ids") or data.get("messageIds") or data.get("message_ids") or []
    if not isinstance(raw_ids, list):
        raw_ids = [raw_ids]
    return [value for value in raw_ids if value not in (None, "")]


class DailyStatsAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        today_start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        queryset = _order_queryset(request).filter(created_time__gte=today_start, created_time__lt=today_end)
        active_queryset = queryset.exclude(status="cancelled")
        paid_queryset = queryset.filter(PAID_ORDER_FILTER)

        revenue = _to_decimal(paid_queryset.aggregate(total=Sum("total_price"))["total"])
        orders_count = active_queryset.count()
        average_order_value = revenue / orders_count if orders_count else Decimal("0.00")
        active_staff = ChefStaff.objects.filter(restaurant_id__in=_restaurant_ids_for_request(request), action="accepted").count()

        return Response({
            "totalRevenue": float(revenue),
            "total_revenue": float(revenue),
            "revenue": float(revenue),
            "totalOrders": orders_count,
            "total_orders": orders_count,
            "orders": orders_count,
            "ordersCount": orders_count,
            "averageOrderValue": float(average_order_value),
            "average_order_value": float(average_order_value),
            "aov": float(average_order_value),
            "activeStaff": active_staff,
            "active_staff": active_staff,
        })


class SalesAnalyticsAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        now = timezone.now()
        start = _safe_datetime(request.query_params.get("startDate") or request.query_params.get("start_date"), now - timedelta(days=13))
        end = _safe_datetime(request.query_params.get("endDate") or request.query_params.get("end_date"), now)
        if end < start:
            start, end = end, start

        same_day = timezone.localtime(start).date() == timezone.localtime(end).date()
        trunc = TruncHour if same_day else TruncDay
        label_format = "%H:00" if same_day else "%d %b"

        rows = (
            _order_queryset(request)
            .filter(created_time__gte=start, created_time__lte=end)
            .filter(PAID_ORDER_FILTER)
            .annotate(period=trunc("created_time"))
            .values("period")
            .annotate(revenue=Sum("total_price"), orders=Count("id"))
            .order_by("period")
        )

        labels = []
        revenue = []
        orders = []
        chart_rows = []
        for row in rows:
            period = timezone.localtime(row["period"]) if row["period"] else None
            label = period.strftime(label_format) if period else ""
            total_revenue = float(row["revenue"] or 0)
            total_orders = int(row["orders"] or 0)
            labels.append(label)
            revenue.append(total_revenue)
            orders.append(total_orders)
            chart_rows.append({
                "label": label,
                "date": period.isoformat() if period else None,
                "revenue": total_revenue,
                "orders": total_orders,
            })

        return Response({
            "labels": labels,
            "revenue": revenue,
            "orders": orders,
            "data": chart_rows,
            "sales": chart_rows,
        })


class LeadsAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, identifier="default"):
        queryset = Lead.objects.select_related("restaurant").order_by("-last_seen")
        if identifier and identifier != "default":
            queryset = queryset.filter(restaurant_id=identifier)
        return Response({"leads": [_lead_payload(lead) for lead in queryset]})

    def patch(self, request, identifier):
        try:
            lead = Lead.objects.get(pk=identifier)
        except (Lead.DoesNotExist, ValueError):
            return Response({"error": "Lead not found"}, status=status.HTTP_404_NOT_FOUND)

        allowed_statuses = {choice[0] for choice in Lead.STATUS_CHOICES}
        next_status = request.data.get("status")
        if next_status is not None:
            if next_status not in allowed_statuses:
                return Response({"error": "Invalid lead status"}, status=status.HTTP_400_BAD_REQUEST)
            lead.status = next_status

        if "notes" in request.data:
            lead.notes = str(request.data.get("notes") or "")
        if "tags" in request.data:
            tags = request.data.get("tags")
            lead.tags = tags if isinstance(tags, list) else []

        lead.save()
        return Response(_lead_payload(lead))

    def put(self, request, identifier):
        return self.patch(request, identifier)


class TableMessagesAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def _message_queryset(self, request, identifier=None):
        queryset = TableMessage.objects.select_related("restaurant", "device").order_by("-created_at")
        if identifier:
            return queryset.filter(pk=identifier)

        restaurant_ids = _restaurant_ids_for_request(request)
        if restaurant_ids:
            queryset = queryset.filter(Q(restaurant_id__in=restaurant_ids) | Q(restaurant__isnull=True))
        return queryset

    def get(self, request, identifier=None):
        queryset = self._message_queryset(request, identifier)
        if identifier:
            message = queryset.first()
            if not message:
                return Response({"error": "Table message not found"}, status=status.HTTP_404_NOT_FOUND)
            return Response(_table_message_payload(message))
        return Response([_table_message_payload(message) for message in queryset[:250]])

    def post(self, request):
        table_number = request.data.get("tableNumber") or request.data.get("table_number")
        table_name = str(request.data.get("tableName") or request.data.get("table_name") or "").strip()
        device_id = request.data.get("deviceId") or request.data.get("device_id")
        restaurant_id = request.data.get("restaurantId") or request.data.get("restaurant_id")

        device = None
        if device_id:
            device = Device.objects.filter(pk=device_id).select_related("restaurant").first()
        if not device and table_number:
            device = Device.objects.filter(table_number=str(table_number)).select_related("restaurant").first()
        if not device and table_name:
            device = Device.objects.filter(table_name=table_name).select_related("restaurant").first()

        restaurant = device.restaurant if device else None
        if not restaurant and restaurant_id:
            restaurant = Restaurant.objects.filter(pk=restaurant_id).first()

        try:
            parsed_table_number = int(table_number) if table_number not in (None, "") else None
        except (TypeError, ValueError):
            parsed_table_number = None

        message_type = str(request.data.get("type") or "chat").lower()
        if message_type not in {choice[0] for choice in TableMessage.TYPE_CHOICES}:
            message_type = "chat"

        status_value = str(request.data.get("status") or "pending").lower()
        if status_value == "unread":
            status_value = "pending"
        if status_value not in {choice[0] for choice in TableMessage.STATUS_CHOICES}:
            status_value = "pending"

        message = TableMessage.objects.create(
            restaurant=restaurant,
            device=device,
            table_number=parsed_table_number,
            table_name=table_name or getattr(device, "table_name", "") or (f"Table {parsed_table_number}" if parsed_table_number else "Table"),
            type=message_type,
            message=str(request.data.get("message") or "").strip(),
            status=status_value,
        )
        return Response(_table_message_payload(message), status=status.HTTP_201_CREATED)

    def patch(self, request, identifier=None):
        queryset = self._message_queryset(request, identifier)
        if not identifier:
            ids = _ids_from_payload(request.data)
            if ids:
                queryset = queryset.filter(pk__in=ids)
            else:
                table_number = request.data.get("tableNumber") or request.data.get("table_number")
                if table_number not in (None, ""):
                    queryset = queryset.filter(table_number=table_number)
                else:
                    return Response({"error": "ids, tableNumber, or message id is required"}, status=status.HTTP_400_BAD_REQUEST)

        next_status = str(request.data.get("status") or "acknowledged").lower()
        if next_status == "unread":
            next_status = "pending"
        if next_status not in {choice[0] for choice in TableMessage.STATUS_CHOICES}:
            return Response({"error": "Invalid table message status"}, status=status.HTTP_400_BAD_REQUEST)

        updated = queryset.update(status=next_status, updated_at=timezone.now())
        return Response({"updated": updated, "status": next_status})

    def put(self, request, identifier=None):
        return self.patch(request, identifier)

    def delete(self, request, identifier=None):
        queryset = self._message_queryset(request, identifier)
        if not identifier:
            ids = _ids_from_payload(request.data)
            if ids:
                queryset = queryset.filter(pk__in=ids)
            else:
                table_number = request.data.get("tableNumber") or request.data.get("table_number")
                if table_number not in (None, ""):
                    queryset = queryset.filter(table_number=table_number)
                else:
                    return Response({"error": "ids, tableNumber, or message id is required"}, status=status.HTTP_400_BAD_REQUEST)

        deleted_count, _ = queryset.delete()
        return Response({"deleted": deleted_count}, status=status.HTTP_200_OK)


class SeedMultiLocationAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        restaurant_count = Restaurant.objects.count()
        return Response({
            "ok": True,
            "seeded": restaurant_count == 0,
            "restaurants": restaurant_count,
            "message": "Multi-location seed compatibility endpoint is available.",
        })


class EnsureLocationMetricsAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        restaurant_ids = _restaurant_ids_for_request(request)
        orders = Order.objects.filter(restaurant_id__in=restaurant_ids) if restaurant_ids else Order.objects.all()
        devices = Device.objects.filter(restaurant_id__in=restaurant_ids) if restaurant_ids else Device.objects.all()
        paid_orders = orders.filter(PAID_ORDER_FILTER)
        revenue = _to_decimal(paid_orders.aggregate(total=Sum("total_price"))["total"])

        return Response({
            "ok": True,
            "metricsEnsured": True,
            "restaurants": len(restaurant_ids),
            "orders": orders.count(),
            "devices": devices.count(),
            "revenue": float(revenue),
        })
