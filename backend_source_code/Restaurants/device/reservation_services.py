from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from .models import Device, Reservation


OCCUPYING_STATUSES = {'confirmed', 'accept', 'overdue', 'seated', 'extended'}


class ReservationConflictError(ValueError):
    def __init__(self, message='No table is available for that time.', reservation=None):
        super().__init__(message)
        self.reservation = reservation


def default_duration(restaurant) -> int:
    return max(15, int(getattr(restaurant, 'reservation_duration_minutes', 90) or 90))


def reservation_end(reservation: Reservation):
    if reservation.end_time:
        return reservation.end_time
    minutes = int(reservation.duration_minutes or 90) + int(reservation.buffer_minutes or 0)
    return reservation.reservation_time + timedelta(minutes=minutes)


def conflicting_reservation(device_id, start, end, exclude_id=None):
    queryset = Reservation.objects.filter(
        device_id=device_id,
        status__in=OCCUPYING_STATUSES,
        reservation_time__lt=end,
    )
    if exclude_id:
        queryset = queryset.exclude(pk=exclude_id)
    for existing in queryset.only(
        'id', 'reservation_time', 'end_time', 'duration_minutes', 'buffer_minutes'
    ):
        if reservation_end(existing) > start:
            return existing
    return None


def _eligible_tables(restaurant, guests, lock=False):
    queryset = Device.objects.filter(
        restaurant=restaurant,
        action='active',
        capacity__gte=max(1, int(guests)),
    ).order_by('capacity', 'id')
    return queryset.select_for_update() if lock else queryset


def available_tables(restaurant, start, guests, duration_minutes=None, buffer_minutes=10, exclude_id=None):
    duration = int(duration_minutes or default_duration(restaurant))
    end = start + timedelta(minutes=duration + int(buffer_minutes or 0))
    return [
        table for table in _eligible_tables(restaurant, guests)
        if not conflicting_reservation(table.id, start, end, exclude_id=exclude_id)
    ]


@transaction.atomic
def create_for_device(*, device, reservation_time, guest_no, duration_minutes=None, buffer_minutes=10, **values):
    device = Device.objects.select_for_update().select_related('restaurant').get(pk=device.pk)
    guests = max(1, int(guest_no))
    if device.action != 'active' or device.capacity < guests:
        raise ReservationConflictError('That table cannot seat this party.')
    duration = int(duration_minutes or default_duration(device.restaurant))
    end = reservation_time + timedelta(minutes=duration + int(buffer_minutes or 0))
    conflict = conflicting_reservation(device.id, reservation_time, end)
    if conflict:
        raise ReservationConflictError('Reservation conflicts with an existing booking.', conflict)
    return Reservation.objects.create(
        device=device,
        restaurant=device.restaurant,
        table_name=device.table_name,
        table_capacity=device.capacity,
        reservation_time=reservation_time,
        end_time=end,
        guest_no=guests,
        duration_minutes=duration,
        buffer_minutes=buffer_minutes,
        **values,
    )


@transaction.atomic
def create_for_available_table(*, restaurant, reservation_time, guest_no, duration_minutes=None, buffer_minutes=10, **values):
    duration = int(duration_minutes or default_duration(restaurant))
    end = reservation_time + timedelta(minutes=duration + int(buffer_minutes or 0))
    for table in _eligible_tables(restaurant, guest_no, lock=True):
        if conflicting_reservation(table.id, reservation_time, end):
            continue
        return Reservation.objects.create(
            device=table,
            restaurant=restaurant,
            table_name=table.table_name,
            table_capacity=table.capacity,
            reservation_time=reservation_time,
            end_time=end,
            guest_no=guest_no,
            duration_minutes=duration,
            buffer_minutes=buffer_minutes,
            **values,
        )
    raise ReservationConflictError()


@transaction.atomic
def reschedule(reservation, *, reservation_time, guest_no=None, duration_minutes=None, buffer_minutes=None, device=None, allow_reassign=False):
    reservation = Reservation.objects.select_for_update().select_related('restaurant', 'device').get(pk=reservation.pk)
    guests = int(guest_no or reservation.guest_no)
    duration = int(duration_minutes or reservation.duration_minutes or default_duration(reservation.restaurant))
    buffer = int(reservation.buffer_minutes if buffer_minutes is None else buffer_minutes)
    end = reservation_time + timedelta(minutes=duration + buffer)
    preferred = device or reservation.device
    candidates = []
    if preferred:
        candidates.append(Device.objects.select_for_update().get(pk=preferred.pk))
    if allow_reassign:
        candidates.extend(
            table for table in _eligible_tables(reservation.restaurant, guests, lock=True)
            if not preferred or table.pk != preferred.pk
        )
    for table in candidates:
        if table.restaurant_id != reservation.restaurant_id or table.action != 'active' or table.capacity < guests:
            continue
        if conflicting_reservation(table.id, reservation_time, end, exclude_id=reservation.id):
            continue
        reservation.device = table
        reservation.table_name = table.table_name
        reservation.table_capacity = table.capacity
        reservation.reservation_time = reservation_time
        reservation.end_time = end
        reservation.guest_no = guests
        reservation.duration_minutes = duration
        reservation.buffer_minutes = buffer
        reservation.save()
        return reservation
    raise ReservationConflictError()


def available_slots(restaurant, reservation_date, guests, *, exclude_id=None, now=None):
    try:
        restaurant_tz = ZoneInfo(restaurant.timezone or 'Asia/Dubai')
    except Exception:
        restaurant_tz = ZoneInfo('Asia/Dubai')
    cursor = datetime.combine(reservation_date, restaurant.reservation_slot_start, tzinfo=restaurant_tz)
    closing = datetime.combine(reservation_date, restaurant.reservation_slot_end, tzinfo=restaurant_tz)
    current = (now or timezone.now()).astimezone(restaurant_tz)
    slots = []
    while cursor <= closing:
        utc_start = cursor.astimezone(ZoneInfo('UTC'))
        if cursor > current and available_tables(restaurant, utc_start, guests, exclude_id=exclude_id):
            slots.append({'time': cursor.strftime('%H:%M'), 'label': cursor.strftime('%I:%M %p'), 'start': utc_start.isoformat()})
        cursor += timedelta(minutes=30)
    return slots


def next_available_date(restaurant, start_date, guests, days=14):
    for offset in range(1, days + 1):
        candidate = start_date + timedelta(days=offset)
        slots = available_slots(restaurant, candidate, guests)
        if slots:
            return candidate, slots
    return None, []
