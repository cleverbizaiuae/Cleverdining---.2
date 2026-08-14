from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone as dt_timezone
from typing import Any
from zoneinfo import ZoneInfo

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from customer.models import Lead, WhatsAppConversation
from device.models import Device, Reservation
from device.serializers import ReservationSerializer
from restaurant.models import Restaurant

logger = logging.getLogger(__name__)

DIALOG_360_MESSAGES_URL = "https://waba-v2.360dialog.io/messages"
TERMINAL_RESERVATION_STATUSES = {"finished", "cancelled", "cancel", "no_show"}
YES_WORDS = {"yes", "y", "confirm", "confirmed", "ok", "okay", "book", "book it", "sure"}
CANCEL_WORDS = {"cancel", "stop", "nevermind", "never mind", "no"}
RESTART_WORDS = {"restart", "start over", "edit", "change"}


@dataclass
class Dialog360Message:
    restaurant: Restaurant | None
    phone_number_id: str
    waba_id: str
    display_phone_number: str
    sender_phone: str
    sender_name: str
    message_id: str
    chat_id: str
    text: str
    raw: dict[str, Any]


def _dig(data: dict[str, Any], *keys: str) -> Any:
    current: Any = data
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _first_change_value(payload: dict[str, Any]) -> dict[str, Any]:
    first_value: dict[str, Any] | None = None
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        for change in entry.get("changes") or []:
            if not isinstance(change, dict):
                continue
            value = change.get("value") or {}
            if not isinstance(value, dict):
                continue
            if first_value is None:
                first_value = value
            if value.get("messages"):
                return value
    if first_value is not None:
        return first_value
    return payload


def _extract_text(message: dict[str, Any]) -> str:
    msg_type = message.get("type")
    if msg_type == "text":
        return str(_dig(message, "text", "body") or "").strip()
    if msg_type == "button":
        return str(_dig(message, "button", "text") or _dig(message, "button", "payload") or "").strip()
    if msg_type == "interactive":
        return str(
            _dig(message, "interactive", "button_reply", "title")
            or _dig(message, "interactive", "button_reply", "id")
            or _dig(message, "interactive", "list_reply", "title")
            or _dig(message, "interactive", "list_reply", "id")
            or ""
        ).strip()
    return ""


def _find_restaurant(phone_number_id: str, waba_id: str, display_phone_number: str) -> Restaurant | None:
    digits = re.sub(r"\D", "", display_phone_number or "")
    query = Q(whatsapp_enabled=True)
    identifiers = Q()
    if phone_number_id:
        identifiers |= Q(whatsapp_phone_number_id=phone_number_id)
    if waba_id:
        identifiers |= Q(whatsapp_waba_id=waba_id)
    if display_phone_number:
        identifiers |= Q(whatsapp_business_display_number=display_phone_number)
    if digits:
        identifiers |= Q(whatsapp_business_display_number__icontains=digits[-8:])
    if not identifiers:
        return None
    return Restaurant.objects.filter(query & identifiers).first()


def parse_360dialog_message(payload: dict[str, Any]) -> Dialog360Message | None:
    value = _first_change_value(payload)
    messages = value.get("messages") or payload.get("messages") or []
    if not messages:
        return None

    message = messages[0]
    if not isinstance(message, dict):
        return None
    metadata = value.get("metadata") or payload.get("metadata") or {}
    contacts = value.get("contacts") or payload.get("contacts") or []
    contact = contacts[0] if contacts else {}

    phone_number_id = str(metadata.get("phone_number_id") or payload.get("phone_number_id") or "")
    display_phone_number = str(metadata.get("display_phone_number") or payload.get("display_phone_number") or "")
    waba_id = str(value.get("waba_id") or payload.get("waba_id") or _dig(payload, "hub", "waba_id") or "")
    sender_phone = str(message.get("from") or contact.get("wa_id") or "")
    sender_name = str(_dig(contact, "profile", "name") or message.get("profile_name") or "Guest")
    message_id = str(message.get("id") or "")
    chat_id = str(message.get("context", {}).get("id") or sender_phone)
    text = _extract_text(message)
    restaurant = _find_restaurant(phone_number_id, waba_id, display_phone_number)

    return Dialog360Message(
        restaurant=restaurant,
        phone_number_id=phone_number_id,
        waba_id=waba_id,
        display_phone_number=display_phone_number,
        sender_phone=sender_phone,
        sender_name=sender_name,
        message_id=message_id,
        chat_id=chat_id,
        text=text,
        raw=payload,
    )


def _restaurant_tz(restaurant: Restaurant) -> ZoneInfo:
    try:
        return ZoneInfo(getattr(restaurant, "timezone", None) or "Asia/Dubai")
    except Exception:
        return ZoneInfo("Asia/Dubai")


def _parse_party_size(text: str) -> int | None:
    patterns = [
        r"\b(?:for|party of|table for)\s*(\d{1,2})\b",
        r"\b(\d{1,2})\s*(?:people|guests|pax|persons|person)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            value = int(match.group(1))
            if 1 <= value <= 30:
                return value
    return None


def _parse_date(text: str, tz: ZoneInfo) -> datetime.date | None:
    now = timezone.now().astimezone(tz)
    lower = text.lower()
    if "day after tomorrow" in lower:
        return (now + timedelta(days=2)).date()
    if "tomorrow" in lower:
        return (now + timedelta(days=1)).date()
    if "today" in lower or "tonight" in lower:
        return now.date()

    match = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", text)
    if match:
        year, month, day = map(int, match.groups())
        try:
            return datetime(year, month, day).date()
        except ValueError:
            return None

    match = re.search(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", text)
    if match:
        day, month, year = match.groups()
        year_int = int(year) if year else now.year
        if year_int < 100:
            year_int += 2000
        try:
            return datetime(year_int, int(month), int(day)).date()
        except ValueError:
            return None
    return None


def _parse_time(text: str) -> time | None:
    match = re.search(r"\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b", text, re.I)
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2) or 0)
        meridiem = match.group(3).lower()
        if meridiem == "pm" and hour != 12:
            hour += 12
        if meridiem == "am" and hour == 12:
            hour = 0
        return time(hour, minute)

    match = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", text)
    if match:
        return time(int(match.group(1)), int(match.group(2)))
    return None


def _parse_customer_name(text: str, fallback: str) -> str:
    match = re.search(r"\b(?:name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z .'-]{1,50})", text, re.I)
    if match:
        return match.group(1).strip().title()
    return fallback or "Guest"


def _parse_explicit_customer_name(text: str) -> str | None:
    match = re.search(r"\b(?:name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z .'-]{1,50})", text, re.I)
    if match:
        return match.group(1).strip().title()
    return None


def _plain_name(text: str) -> str | None:
    value = re.sub(r"[^A-Za-z .'-]", "", text or "").strip()
    if 2 <= len(value) <= 60 and any(char.isalpha() for char in value):
        return value.title()
    return None


def _find_available_table(restaurant: Restaurant, start: datetime, guests: int, duration_minutes: int = 90) -> Device | None:
    end = start + timedelta(minutes=duration_minutes + 10)
    tables = Device.objects.filter(restaurant=restaurant, action="active").order_by("id")
    for table in tables:
        conflict = Reservation.objects.filter(device=table).exclude(status__in=TERMINAL_RESERVATION_STATUSES).filter(
            reservation_time__lt=end,
            end_time__gt=start,
        ).exists()
        if not conflict:
            return table
    return None


def _broadcast_reservation(reservation: Reservation) -> None:
    try:
        channel_layer = get_channel_layer()
        if not channel_layer or not reservation.restaurant_id:
            return
        async_to_sync(channel_layer.group_send)(
            f"restaurant_{reservation.restaurant_id}",
            {"type": "reservation_created", "reservation": ReservationSerializer(reservation).data},
        )
    except Exception:
        logger.exception("360dialog reservation broadcast skipped")


def _upsert_lead(message: Dialog360Message, confirmed: bool = False) -> None:
    if not message.restaurant or not message.sender_phone:
        return
    lead, _ = Lead.objects.get_or_create(
        restaurant=message.restaurant,
        phone=message.sender_phone,
        defaults={
            "name": message.sender_name or "Guest",
            "source": "whatsapp",
            "status": "new",
            "notes": message.text[:500],
            "tags": ["360dialog"],
        },
    )
    lead.name = lead.name if lead.name and lead.name != "Guest" else (message.sender_name or "Guest")
    lead.source = "whatsapp"
    lead.total_reservation_attempts = (lead.total_reservation_attempts or 0) + 1
    if confirmed:
        lead.total_confirmed_reservations = (lead.total_confirmed_reservations or 0) + 1
        if lead.status == "new":
            lead.status = "qualified"
    if "360dialog" not in (lead.tags or []):
        lead.tags = [*(lead.tags or []), "360dialog"]
    lead.notes = message.text[:1000]
    lead.save()


def _get_conversation(message: Dialog360Message) -> WhatsAppConversation:
    conversation, _ = WhatsAppConversation.objects.get_or_create(
        restaurant=message.restaurant,
        phone=message.sender_phone,
        provider="360dialog",
        defaults={
            "state": "idle",
            "context": {},
            "external_chat_id": message.chat_id or "",
            "last_message_id": message.message_id or "",
        },
    )
    conversation.external_chat_id = message.chat_id or conversation.external_chat_id
    conversation.last_message_id = message.message_id or conversation.last_message_id
    conversation.last_message = message.text[:4000]
    conversation.expires_at = timezone.now() + timedelta(hours=6)
    return conversation


def _context_date(value: Any) -> datetime.date | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return None


def _context_time(value: Any) -> time | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%H:%M").time()
    except ValueError:
        return None


def _apply_message_to_context(
    conversation: WhatsAppConversation,
    message: Dialog360Message,
    text: str,
) -> dict[str, Any]:
    restaurant = message.restaurant
    tz = _restaurant_tz(restaurant)
    context = dict(conversation.context or {})
    lower = text.lower().strip()

    parsed_date = _parse_date(text, tz)
    parsed_time = _parse_time(text)
    parsed_guests = _parse_party_size(text)
    parsed_name = _parse_explicit_customer_name(text)

    if parsed_date:
        context["date"] = parsed_date.isoformat()
    elif context.get("awaiting") == "date":
        parsed_date = _parse_date(f"on {text}", tz)
        if parsed_date:
            context["date"] = parsed_date.isoformat()

    if parsed_time:
        context["time"] = parsed_time.strftime("%H:%M")
    elif context.get("awaiting") == "time":
        parsed_time = _parse_time(text)
        if parsed_time:
            context["time"] = parsed_time.strftime("%H:%M")

    if parsed_guests:
        context["guests"] = parsed_guests
    elif context.get("awaiting") == "guests":
        digit_match = re.search(r"\b(\d{1,2})\b", text)
        if digit_match:
            guests = int(digit_match.group(1))
            if 1 <= guests <= 30:
                context["guests"] = guests

    if parsed_name:
        context["customer_name"] = parsed_name
    elif context.get("awaiting") == "name":
        plain_name = _plain_name(text)
        if plain_name and lower not in YES_WORDS | CANCEL_WORDS | RESTART_WORDS:
            context["customer_name"] = plain_name
    elif not context.get("customer_name") and message.sender_name and message.sender_name != "Guest":
        context["customer_name"] = message.sender_name

    if text and lower not in YES_WORDS | CANCEL_WORDS | RESTART_WORDS:
        context["raw_request"] = " ".join([str(context.get("raw_request") or ""), text]).strip()[-2000:]

    return context


def _next_missing_field(context: dict[str, Any]) -> str | None:
    if not context.get("customer_name"):
        return "name"
    if not context.get("guests"):
        return "guests"
    if not context.get("date"):
        return "date"
    if not context.get("time"):
        return "time"
    return None


def _question_for(field: str, restaurant: Restaurant) -> str:
    questions = {
        "name": f"Welcome to {restaurant.resturent_name}. What name should I put the booking under?",
        "guests": "How many guests will be joining?",
        "date": "Which date would you like to book? You can reply with today, tomorrow, or DD/MM/YYYY.",
        "time": "What time should I book it for? Example: 7:30pm.",
    }
    return questions[field]


def _reservation_summary(context: dict[str, Any], restaurant: Restaurant) -> str:
    reservation_date = _context_date(context.get("date"))
    reservation_time = _context_time(context.get("time"))
    date_label = reservation_date.strftime("%d %b %Y") if reservation_date else str(context.get("date"))
    time_label = reservation_time.strftime("%I:%M %p") if reservation_time else str(context.get("time"))
    return (
        f"Please confirm your reservation at {restaurant.resturent_name}:\n"
        f"Name: {context.get('customer_name')}\n"
        f"Guests: {context.get('guests')}\n"
        f"Date: {date_label}\n"
        f"Time: {time_label}\n\n"
        "Reply YES to confirm, EDIT to restart, or CANCEL to stop."
    )


def _create_reservation_from_context(
    conversation: WhatsAppConversation,
    message: Dialog360Message,
) -> Reservation:
    restaurant = message.restaurant
    tz = _restaurant_tz(restaurant)
    context = conversation.context or {}
    reservation_date = _context_date(context.get("date"))
    reservation_clock = _context_time(context.get("time"))
    if not reservation_date or not reservation_clock or not context.get("guests"):
        raise ValueError("Conversation is missing reservation fields")

    local_dt = datetime.combine(reservation_date, reservation_clock, tzinfo=tz)
    reservation_time = local_dt.astimezone(dt_timezone.utc)
    guests = int(context.get("guests") or 1)
    table = _find_available_table(restaurant, reservation_time, guests)
    status = "confirmed" if table else "pending"

    reservation = Reservation.objects.create(
        customer_name=str(context.get("customer_name") or message.sender_name or "Guest")[:255],
        device=table,
        restaurant=restaurant,
        table_name=table.table_name if table else "",
        guest_no=guests,
        cell_number=message.sender_phone[:15],
        source="whatsapp",
        reservation_time=reservation_time,
        duration_minutes=90,
        buffer_minutes=10,
        status=status,
        custom_request=str(context.get("raw_request") or message.text or ""),
        whatsapp_phone_number_id=message.phone_number_id or None,
        whatsapp_chat_id=message.chat_id or None,
        whatsapp_message_id=message.message_id or None,
        raw_customer_text=str(context.get("raw_request") or message.text or ""),
        ai_confidence="0.82",
        missing_fields="",
    )
    _broadcast_reservation(reservation)
    return reservation


def send_360dialog_text(restaurant: Restaurant, to: str, body: str) -> bool:
    api_key = getattr(restaurant, "whatsapp_access_token", None)
    if not api_key or not to or not body:
        return False
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": re.sub(r"\D", "", to),
        "type": "text",
        "text": {"preview_url": False, "body": body[:4000]},
    }
    try:
        response = requests.post(
            DIALOG_360_MESSAGES_URL,
            json=payload,
            headers={"D360-API-KEY": api_key, "Content-Type": "application/json"},
            timeout=8,
        )
        if response.status_code >= 400:
            logger.error(
                "360dialog outbound send failed restaurant_id=%s status=%s response=%s",
                restaurant.id,
                response.status_code,
                response.text[:500],
            )
        return response.status_code < 400
    except requests.RequestException:
        logger.exception("360dialog outbound send error restaurant_id=%s", restaurant.id)
        return False


def _save_conversation(conversation: WhatsAppConversation, message: Dialog360Message) -> bool:
    try:
        conversation.save()
        return True
    except Exception:
        logger.exception(
            "360dialog conversation save failed restaurant_id=%s message_id=%s",
            message.restaurant.id if message.restaurant else None,
            message.message_id,
        )
        return False


def _send_reply_result(
    message: Dialog360Message,
    body: str,
    action: str,
    **details: Any,
) -> dict[str, Any]:
    sent = send_360dialog_text(message.restaurant, message.sender_phone, body)
    result: dict[str, Any] = {
        "handled": sent,
        "action": action if sent else "outbound_send_failed",
        "outbound_sent": sent,
        **details,
    }
    if not sent:
        result["intended_action"] = action
    return result


def _missing_prompt(missing: list[str], restaurant: Restaurant) -> str:
    missing_text = ", ".join(missing)
    return (
        f"Thanks for messaging {restaurant.resturent_name}. "
        f"To book your table, please send: date, time, number of guests, and name. Missing: {missing_text}."
    )


def handle_360dialog_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    message = parse_360dialog_message(payload)
    if not message:
        logger.info("360dialog webhook ignored because it contained no customer message")
        return {"handled": False, "reason": "No customer message in payload"}
    if not message.restaurant:
        logger.warning(
            "360dialog webhook could not match restaurant phone_number_id=%s waba_id=%s",
            message.phone_number_id,
            message.waba_id,
        )
        return {"handled": False, "reason": "No restaurant matched this WABA or phone number"}

    restaurant = message.restaurant
    text = message.text or ""
    lower = text.lower().strip()

    if not restaurant.whatsapp_chatbot_enabled:
        return {"handled": True, "action": "chatbot_disabled"}

    logger.info(
        "360dialog inbound customer message matched restaurant_id=%s message_id=%s",
        restaurant.id,
        message.message_id,
    )

    lead_recorded = True
    try:
        _upsert_lead(message, confirmed=False)
    except Exception:
        lead_recorded = False
        logger.exception(
            "360dialog lead update failed without blocking reply restaurant_id=%s message_id=%s",
            restaurant.id,
            message.message_id,
        )

    try:
        conversation = _get_conversation(message)
    except Exception:
        logger.exception(
            "360dialog conversation load failed; sending stateless greeting restaurant_id=%s message_id=%s",
            restaurant.id,
            message.message_id,
        )
        reply = _question_for("name", restaurant)
        return _send_reply_result(
            message,
            reply,
            "conversation_started",
            awaiting="name",
            conversation_persisted=False,
            lead_recorded=lead_recorded,
        )

    if lower in CANCEL_WORDS:
        conversation.state = "cancelled"
        conversation.context = {}
        reply = "No problem, I have cancelled this booking request. Message us again anytime to make a reservation."
        conversation.last_response = reply
        persisted = _save_conversation(conversation, message)
        return _send_reply_result(
            message,
            reply,
            "conversation_cancelled",
            conversation_persisted=persisted,
            lead_recorded=lead_recorded,
        )

    if lower in RESTART_WORDS:
        conversation.state = "collecting"
        conversation.context = {"awaiting": "name"}
        reply = _question_for("name", restaurant)
        conversation.last_response = reply
        persisted = _save_conversation(conversation, message)
        return _send_reply_result(
            message,
            reply,
            "conversation_restarted",
            awaiting="name",
            conversation_persisted=persisted,
            lead_recorded=lead_recorded,
        )

    if lower in {"hi", "hello", "hey", "start", "book", "booking", "reservation"}:
        conversation.state = "collecting"
        conversation.context = {"awaiting": "name"}
        reply = _question_for("name", restaurant)
        conversation.last_response = reply
        persisted = _save_conversation(conversation, message)
        return _send_reply_result(
            message,
            reply,
            "conversation_started",
            awaiting="name",
            conversation_persisted=persisted,
            lead_recorded=lead_recorded,
        )

    if conversation.state == "confirming" and lower in YES_WORDS:
        try:
            reservation = _create_reservation_from_context(conversation, message)
        except ValueError:
            conversation.state = "collecting"
            context = conversation.context or {}
            missing = _next_missing_field(context) or "name"
            context["awaiting"] = missing
            conversation.context = context
            reply = _question_for(missing, restaurant)
            conversation.last_response = reply
            persisted = _save_conversation(conversation, message)
            return _send_reply_result(
                message,
                reply,
                "confirmation_missing_fields",
                awaiting=missing,
                conversation_persisted=persisted,
                lead_recorded=lead_recorded,
            )
        except Exception:
            logger.exception(
                "360dialog reservation creation failed restaurant_id=%s message_id=%s",
                restaurant.id,
                message.message_id,
            )
            reply = "I could not complete that reservation right now. Please try again in a moment."
            return _send_reply_result(
                message,
                reply,
                "reservation_creation_failed",
                conversation_persisted=True,
                lead_recorded=lead_recorded,
            )

        conversation.state = "completed"
        conversation.context = {**(conversation.context or {}), "reservation_id": reservation.id, "awaiting": None}
        local_dt = reservation.reservation_time.astimezone(_restaurant_tz(restaurant))
        if reservation.status == "confirmed":
            reply = (
                f"Confirmed. Your table at {restaurant.resturent_name} is booked for "
                f"{reservation.guest_no} guest(s) on {local_dt.strftime('%d %b %Y at %I:%M %p')}. "
                f"Table: {reservation.table_name}. {restaurant.whatsapp_signoff or ''}".strip()
            )
        else:
            reply = (
                f"Received. Your request for {reservation.guest_no} guest(s) on "
                f"{local_dt.strftime('%d %b %Y at %I:%M %p')} is pending table confirmation."
            )
        conversation.last_response = reply
        persisted = _save_conversation(conversation, message)
        try:
            _upsert_lead(message, confirmed=(reservation.status == "confirmed"))
        except Exception:
            logger.exception(
                "360dialog confirmed lead update failed restaurant_id=%s reservation_id=%s",
                restaurant.id,
                reservation.id,
            )
        return _send_reply_result(
            message,
            reply,
            "reservation_created",
            reservation_id=reservation.id,
            status=reservation.status,
            conversation_persisted=persisted,
            lead_recorded=lead_recorded,
        )

    if conversation.state in {"idle", "completed", "cancelled"}:
        conversation.state = "collecting"

    context = _apply_message_to_context(conversation, message, text)
    missing_field = _next_missing_field(context)
    if missing_field:
        context["awaiting"] = missing_field
        conversation.state = "collecting"
        conversation.context = context
        reply = _question_for(missing_field, restaurant)
        conversation.last_response = reply
        persisted = _save_conversation(conversation, message)
        return _send_reply_result(
            message,
            reply,
            "requested_field",
            awaiting=missing_field,
            conversation_persisted=persisted,
            lead_recorded=lead_recorded,
        )

    context["awaiting"] = "confirmation"
    conversation.state = "confirming"
    conversation.context = context
    reply = _reservation_summary(context, restaurant)
    conversation.last_response = reply
    persisted = _save_conversation(conversation, message)
    return _send_reply_result(
        message,
        reply,
        "requested_confirmation",
        conversation_persisted=persisted,
        lead_recorded=lead_recorded,
    )


def verify_token_matches(token: str) -> bool:
    if not token:
        return False
    configured = getattr(settings, "WHATSAPP_360DIALOG_VERIFY_TOKEN", "")
    if configured and token == configured:
        return True
    return Restaurant.objects.filter(whatsapp_webhook_verify_token=token).exists()
