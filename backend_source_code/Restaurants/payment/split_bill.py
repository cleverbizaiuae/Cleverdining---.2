from __future__ import annotations

from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
from typing import Any

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from order.models import Order
from .models import OrderBill, OrderBillItem, Payment, PaymentAllocation

TWO_PLACES = Decimal("0.01")
PAYMENT_EPSILON = Decimal("0.01")


def _to_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _q(value: Any) -> Decimal:
    return _to_decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _clamp_zero(value: Decimal) -> Decimal:
    return value if value > 0 else Decimal("0.00")


def _bill_payment_status(total: Decimal, paid: Decimal) -> str:
    if paid <= Decimal("0"):
        return "unpaid"
    if total - paid <= PAYMENT_EPSILON:
        return "fully_paid"
    return "partially_paid"


def _order_payment_status_from_bill(bill: OrderBill) -> str:
    if bill.payment_status == "fully_paid":
        return "paid"
    if bill.payment_status == "partially_paid":
        return "partially_paid"
    return "unpaid"


def _sync_order_from_bill(order: Order, bill: OrderBill) -> None:
    order.amount_paid = min(_q(bill.total_amount), _q(bill.paid_amount))
    order.payment_status = _order_payment_status_from_bill(bill)
    if bill.payment_status == "fully_paid" and order.status not in {"cancelled", "completed"}:
        order.status = "pending" if order.status == "awaiting_payment" else "delivered"
        order.save(update_fields=["amount_paid", "payment_status", "status", "updated_time"])
        return
    order.save(update_fields=["amount_paid", "payment_status", "updated_time"])


def _table_or_order_ref(order: Order) -> str:
    try:
        if order.device and (order.device.table_name or order.device.table_number):
            return str(order.device.table_name or order.device.table_number)
    except Exception:
        pass
    return f"order:{order.id}"


@transaction.atomic
def ensure_bill_for_order(order: Order, *, lock: bool = False) -> OrderBill:
    order_qs = Order.objects
    if lock:
        order_qs = order_qs.select_for_update()

    order = order_qs.select_related("device").get(pk=order.pk)

    subtotal = _q(sum((_to_decimal(entry.quantity) * _to_decimal(entry.price)) for entry in order.order_items.all()))
    tip_amount = _q(order.tip_amount)
    total_amount = _q(order.total_price)
    inferred_fees = _clamp_zero(total_amount - subtotal - tip_amount)

    defaults = {
        "table_or_order_id": _table_or_order_ref(order),
        "subtotal": subtotal,
        "tax_amount": inferred_fees,
        "service_charge": Decimal("0.00"),
        "tip_amount": tip_amount,
        "total_amount": total_amount,
        "paid_amount": Decimal("0.00"),
        "remaining_amount": total_amount,
        "payment_status": "unpaid",
    }

    bill, _ = OrderBill.objects.get_or_create(order=order, defaults=defaults)

    bill.table_or_order_id = _table_or_order_ref(order)
    bill.subtotal = subtotal
    bill.tip_amount = tip_amount
    bill.total_amount = total_amount
    if bill.tax_amount < 0:
        bill.tax_amount = Decimal("0.00")

    _sync_bill_items(bill, order)

    paid_amount = _q(
        bill.allocations.filter(participant_status="paid").aggregate(total=Sum("allocated_amount")).get("total")
        or Decimal("0")
    )
    paid_amount = max(paid_amount, _q(getattr(order, "amount_paid", Decimal("0.00"))))
    paid_amount = min(paid_amount, bill.total_amount)
    bill.paid_amount = paid_amount
    bill.remaining_amount = _clamp_zero(_q(bill.total_amount - paid_amount))
    bill.payment_status = _bill_payment_status(_q(bill.total_amount), paid_amount)

    if bill.split_method != "evenly":
        bill.paid_shares_count = 0
        bill.unpaid_shares_count = 0

    bill.save()

    _sync_order_from_bill(order, bill)

    return bill


def _sync_bill_items(bill: OrderBill, order: Order) -> None:
    seen_ids: set[int] = set()

    for order_item in order.order_items.select_related("item").all():
        total_price = _q(_to_decimal(order_item.quantity) * _to_decimal(order_item.price))
        bill_item, _ = OrderBillItem.objects.get_or_create(
            bill=bill,
            order_item=order_item,
            defaults={
                "item_name": order_item.item.item_name if order_item.item else "Item",
                "quantity": _q(order_item.quantity),
                "unit_price": _q(order_item.price),
                "total_price": total_price,
                "paid_quantity": Decimal("0.00"),
                "paid_amount": Decimal("0.00"),
                "unpaid_amount": total_price,
                "item_status": "unpaid",
            },
        )

        bill_item.item_name = order_item.item.item_name if order_item.item else bill_item.item_name
        bill_item.quantity = _q(order_item.quantity)
        bill_item.unit_price = _q(order_item.price)
        bill_item.total_price = total_price
        bill_item.paid_amount = _q(min(_to_decimal(bill_item.paid_amount), total_price))
        bill_item.paid_quantity = _q(min(_to_decimal(bill_item.paid_quantity), _to_decimal(bill_item.quantity)))
        bill_item.unpaid_amount = _clamp_zero(_q(total_price - bill_item.paid_amount))

        if bill_item.unpaid_amount <= Decimal("0"):
            bill_item.item_status = "paid"
        elif bill_item.paid_amount > Decimal("0"):
            bill_item.item_status = "partially_paid"
        else:
            bill_item.item_status = "unpaid"

        bill_item.save()
        seen_ids.add(bill_item.id)

    bill.bill_items.exclude(id__in=seen_ids).delete()


def build_bill_summary(order: Order) -> dict[str, Any]:
    bill = ensure_bill_for_order(order)

    bill_items_payload = []
    for entry in bill.bill_items.order_by("id"):
        quantity = _q(entry.quantity)
        paid_quantity = _q(entry.paid_quantity)
        unpaid_quantity = _clamp_zero(_q(quantity - paid_quantity))

        bill_items_payload.append(
            {
                "bill_item_id": entry.id,
                "item_name": entry.item_name,
                "quantity": str(quantity),
                "unit_price": str(_q(entry.unit_price)),
                "total_price": str(_q(entry.total_price)),
                "paid_amount": str(_q(entry.paid_amount)),
                "unpaid_amount": str(_q(entry.unpaid_amount)),
                "paid_quantity": str(paid_quantity),
                "unpaid_quantity": str(unpaid_quantity),
                "item_status": entry.item_status,
            }
        )

    paid_share_count = bill.allocations.filter(allocation_type="share", participant_status="paid").count()

    return {
        "bill_id": bill.id,
        "order_id": order.id,
        "table_or_order_id": bill.table_or_order_id,
        "subtotal": str(_q(bill.subtotal)),
        "tax_amount": str(_q(bill.tax_amount)),
        "service_charge": str(_q(bill.service_charge)),
        "tip_amount": str(_q(bill.tip_amount)),
        "total_amount": str(_q(bill.total_amount)),
        "paid_amount": str(_q(bill.paid_amount)),
        "remaining_amount": str(_q(bill.remaining_amount)),
        "payment_status": bill.payment_status,
        "split_method": bill.split_method or None,
        "split_count": bill.split_count,
        "per_person_amount": str(_q(bill.per_person_amount or 0)),
        "paid_shares_count": paid_share_count,
        "unpaid_shares_count": max((bill.split_count or 0) - paid_share_count, 0) if bill.split_count else 0,
        "items": bill_items_payload,
    }


def _enforce_single_mode_if_needed(bill: OrderBill, split_type: str) -> None:
    if bill.paid_amount <= Decimal("0"):
        return
    if bill.split_method and bill.split_method != split_type:
        raise ValidationError("This bill already started with a different split mode.")


def prepare_split_checkout(order: Order, payload: dict[str, Any]) -> dict[str, Any]:
    split_type = str(payload.get("split_type") or "full_bill").strip().lower()
    if split_type not in {"full_bill", "evenly", "my_items"}:
        raise ValidationError("Invalid split_type.")

    bill = ensure_bill_for_order(order, lock=True)
    if bill.remaining_amount <= Decimal("0"):
        raise ValidationError("This bill is already fully paid.")

    _enforce_single_mode_if_needed(bill, split_type)

    plan: list[dict[str, Any]] = []
    amount = Decimal("0.00")

    if split_type == "full_bill":
        amount = _q(bill.remaining_amount)
        bill.split_method = "full_bill"
        plan.append({
            "allocation_type": "bill",
            "allocated_amount": amount,
            "participant_id": str(payload.get("participant") or payload.get("payer_id_or_name") or ""),
        })

    elif split_type == "evenly":
        split_count = int(payload.get("split_count") or bill.split_count or 0)
        if split_count <= 0:
            raise ValidationError("split_count is required for evenly split.")

        if bill.split_count and bill.split_count != split_count:
            raise ValidationError("split_count cannot change after evenly split starts.")

        bill.split_method = "evenly"
        bill.split_count = split_count

        total = _q(bill.total_amount)
        base_share = (total / Decimal(split_count)).quantize(TWO_PLACES, rounding=ROUND_DOWN)
        remainder = total - (base_share * Decimal(split_count))
        remainder_cents = int((remainder / TWO_PLACES).to_integral_value(rounding=ROUND_HALF_UP))

        started_shares = bill.allocations.filter(allocation_type="share", participant_status__in=["unpaid", "paid"]).count()
        if started_shares >= split_count:
            raise ValidationError("All shares are already allocated for this bill.")

        share_index = started_shares
        amount = _q(base_share + (TWO_PLACES if share_index < remainder_cents else Decimal("0")))
        if amount <= Decimal("0"):
            raise ValidationError("Invalid share amount.")

        participant_id = str(payload.get("participant") or payload.get("payer_id_or_name") or f"participant_{share_index + 1}")
        plan.append(
            {
                "allocation_type": "share",
                "allocated_amount": amount,
                "participant_id": participant_id,
            }
        )

        bill.per_person_amount = _q(base_share)
        bill.paid_shares_count = bill.allocations.filter(allocation_type="share", participant_status="paid").count()
        bill.unpaid_shares_count = max(split_count - started_shares, 0)

    else:
        bill.split_method = "my_items"
        selected_items = payload.get("selected_items") or []
        if not isinstance(selected_items, list) or not selected_items:
            raise ValidationError("selected_items is required for my_items split.")

        selected_subtotal = Decimal("0.00")
        bill_items_map = {entry.id: entry for entry in bill.bill_items.select_for_update()}

        for raw in selected_items:
            if not isinstance(raw, dict):
                continue
            try:
                bill_item_id = int(raw.get("bill_item_id"))
            except (TypeError, ValueError):
                raise ValidationError("Invalid bill_item_id in selected_items.")

            bill_item = bill_items_map.get(bill_item_id)
            if not bill_item:
                raise ValidationError(f"Item {bill_item_id} is not part of this bill.")

            unpaid_qty = _clamp_zero(_q(_to_decimal(bill_item.quantity) - _to_decimal(bill_item.paid_quantity)))
            if unpaid_qty <= Decimal("0"):
                raise ValidationError(f"{bill_item.item_name} is already fully paid.")

            req_qty = raw.get("quantity")
            qty = unpaid_qty if req_qty in (None, "") else _q(req_qty)
            if qty <= Decimal("0"):
                raise ValidationError("Selected quantity must be greater than 0.")
            if qty > unpaid_qty:
                raise ValidationError(f"Selected quantity for {bill_item.item_name} exceeds unpaid quantity.")

            line_amount = _q(_to_decimal(bill_item.unit_price) * qty)
            if line_amount > _q(bill_item.unpaid_amount):
                line_amount = _q(bill_item.unpaid_amount)

            selected_subtotal += line_amount
            plan.append(
                {
                    "allocation_type": "item",
                    "bill_item_id": bill_item.id,
                    "allocated_amount": line_amount,
                    "allocated_quantity": qty,
                    "participant_id": str(payload.get("participant") or payload.get("payer_id_or_name") or ""),
                }
            )

        if selected_subtotal <= Decimal("0"):
            raise ValidationError("No payable items selected.")

        fees_total = _q(_to_decimal(bill.tax_amount) + _to_decimal(bill.service_charge))
        proportional_fees = Decimal("0.00")
        if fees_total > Decimal("0") and _to_decimal(bill.subtotal) > Decimal("0"):
            proportional_fees = _q((selected_subtotal / _to_decimal(bill.subtotal)) * fees_total)

        amount = _q(selected_subtotal + proportional_fees)
        if proportional_fees > Decimal("0"):
            plan.append(
                {
                    "allocation_type": "fee",
                    "allocated_amount": proportional_fees,
                    "participant_id": str(payload.get("participant") or payload.get("payer_id_or_name") or ""),
                }
            )

    if amount <= Decimal("0"):
        raise ValidationError("Calculated payable amount must be greater than 0.")
    if amount > _q(bill.remaining_amount):
        amount = _q(bill.remaining_amount)
    plan_total = _q(sum((_to_decimal(entry.get("allocated_amount") or 0) for entry in plan)))
    if plan_total > amount:
        overflow = _q(plan_total - amount)
        for entry in reversed(plan):
            current = _q(entry.get("allocated_amount") or 0)
            if current <= Decimal("0"):
                continue
            reduce_by = min(current, overflow)
            next_amount = _q(current - reduce_by)
            entry["allocated_amount"] = next_amount

            if entry.get("allocation_type") == "item":
                current_qty = _q(entry.get("allocated_quantity") or 0)
                if current > Decimal("0") and current_qty > Decimal("0"):
                    ratio = _to_decimal(next_amount) / _to_decimal(current)
                    entry["allocated_quantity"] = _q(_to_decimal(current_qty) * ratio)

            overflow = _q(overflow - reduce_by)
            if overflow <= Decimal("0"):
                break
        plan = [entry for entry in plan if _q(entry.get("allocated_amount") or 0) > Decimal("0")]

    bill.save()

    return {
        "bill": bill,
        "split_type": split_type,
        "amount": amount,
        "plan": plan,
        "payer_id_or_name": str(payload.get("participant") or payload.get("payer_id_or_name") or "").strip(),
    }


@transaction.atomic
def register_pending_allocations(payment: Payment, plan: list[dict[str, Any]]) -> None:
    allocations: list[PaymentAllocation] = []

    for entry in plan:
        bill_item = None
        bill_item_id = entry.get("bill_item_id")
        if bill_item_id:
            bill_item = OrderBillItem.objects.filter(id=bill_item_id, bill=payment.bill).first()

        allocations.append(
            PaymentAllocation(
                payment=payment,
                bill=payment.bill,
                bill_item=bill_item,
                participant_id=str(entry.get("participant_id") or "").strip(),
                allocated_quantity=_q(entry.get("allocated_quantity") or 0),
                allocated_amount=_q(entry.get("allocated_amount") or 0),
                allocation_type=str(entry.get("allocation_type") or "bill"),
                participant_status="unpaid",
            )
        )

    if allocations:
        PaymentAllocation.objects.bulk_create(allocations)

    _refresh_evenly_counters(payment.bill)


def _refresh_evenly_counters(bill: OrderBill) -> None:
    if bill.split_method != "evenly":
        bill.paid_shares_count = 0
        bill.unpaid_shares_count = 0
        bill.save(update_fields=["paid_shares_count", "unpaid_shares_count", "updated_at"])
        return

    paid_shares = bill.allocations.filter(allocation_type="share", participant_status="paid").count()
    started = bill.allocations.filter(allocation_type="share", participant_status__in=["unpaid", "paid"]).count()
    bill.paid_shares_count = paid_shares
    if bill.split_count:
        bill.unpaid_shares_count = max(bill.split_count - started, 0)
    else:
        bill.unpaid_shares_count = 0
    bill.save(update_fields=["paid_shares_count", "unpaid_shares_count", "updated_at"])


@transaction.atomic
def apply_successful_payment(payment: Payment) -> OrderBill | None:
    if not payment.bill_id:
        return None

    bill = OrderBill.objects.select_for_update().get(id=payment.bill_id)
    allocations = list(PaymentAllocation.objects.select_for_update().filter(payment=payment).order_by("id"))

    if not allocations:
        allocations = [
            PaymentAllocation.objects.create(
                payment=payment,
                bill=bill,
                allocation_type="bill",
                allocated_amount=_q(payment.amount),
                participant_status="unpaid",
            )
        ]

    pooled_item_amount = Decimal("0.00")

    for allocation in allocations:
        if allocation.participant_status == "paid":
            continue

        if allocation.bill_item_id and allocation.allocation_type == "item":
            item = allocation.bill_item
            item.paid_amount = _q(min(_to_decimal(item.total_price), _to_decimal(item.paid_amount) + _to_decimal(allocation.allocated_amount)))
            item.paid_quantity = _q(min(_to_decimal(item.quantity), _to_decimal(item.paid_quantity) + _to_decimal(allocation.allocated_quantity)))
            item.unpaid_amount = _clamp_zero(_q(_to_decimal(item.total_price) - _to_decimal(item.paid_amount)))
            if item.unpaid_amount <= Decimal("0"):
                item.item_status = "paid"
            elif item.paid_amount > Decimal("0"):
                item.item_status = "partially_paid"
            else:
                item.item_status = "unpaid"
            item.save(update_fields=["paid_amount", "paid_quantity", "unpaid_amount", "item_status", "updated_at"])
        elif allocation.allocation_type in {"bill", "share"}:
            pooled_item_amount += _to_decimal(allocation.allocated_amount)

        allocation.participant_status = "paid"
        allocation.save(update_fields=["participant_status", "updated_at"])

    if pooled_item_amount > Decimal("0"):
        for item in bill.bill_items.select_for_update().order_by("id"):
            unpaid = _to_decimal(item.unpaid_amount)
            if unpaid <= Decimal("0"):
                continue
            take = min(unpaid, pooled_item_amount)
            if take <= Decimal("0"):
                continue

            item.paid_amount = _q(_to_decimal(item.paid_amount) + take)
            item.unpaid_amount = _clamp_zero(_q(_to_decimal(item.total_price) - _to_decimal(item.paid_amount)))
            if _to_decimal(item.unit_price) > Decimal("0"):
                paid_qty_increment = _q(take / _to_decimal(item.unit_price))
                item.paid_quantity = _q(min(_to_decimal(item.quantity), _to_decimal(item.paid_quantity) + paid_qty_increment))

            if item.unpaid_amount <= Decimal("0"):
                item.item_status = "paid"
            elif item.paid_amount > Decimal("0"):
                item.item_status = "partially_paid"
            else:
                item.item_status = "unpaid"

            item.save(update_fields=["paid_amount", "paid_quantity", "unpaid_amount", "item_status", "updated_at"])
            pooled_item_amount = _q(pooled_item_amount - take)
            if pooled_item_amount <= Decimal("0"):
                break

    paid_total = _q(
        bill.allocations.filter(participant_status="paid").aggregate(total=Sum("allocated_amount")).get("total")
        or Decimal("0")
    )
    bill.paid_amount = min(_q(bill.total_amount), paid_total)
    bill.remaining_amount = _clamp_zero(_q(_to_decimal(bill.total_amount) - _to_decimal(bill.paid_amount)))
    bill.payment_status = _bill_payment_status(_to_decimal(bill.total_amount), _to_decimal(bill.paid_amount))
    if bill.payment_status == "fully_paid":
        bill.paid_amount = _q(bill.total_amount)
        bill.remaining_amount = Decimal("0.00")

    if bill.split_method == "evenly":
        paid_shares = bill.allocations.filter(allocation_type="share", participant_status="paid").count()
        bill.paid_shares_count = paid_shares
        bill.unpaid_shares_count = max((bill.split_count or 0) - paid_shares, 0) if bill.split_count else 0

    bill.save()

    order = bill.order
    _sync_order_from_bill(order, bill)

    return bill


@transaction.atomic
def mark_payment_failed(payment: Payment) -> None:
    if not payment.bill_id:
        return
    PaymentAllocation.objects.filter(payment=payment, participant_status="unpaid").update(participant_status="failed")
    bill = payment.bill
    if bill:
        _refresh_evenly_counters(bill)
