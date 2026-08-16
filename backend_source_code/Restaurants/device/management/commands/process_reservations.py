from datetime import timedelta
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from device.models import Reservation
from device.reservation_services import reservation_end
from device.serializers import ReservationSerializer
from integrations.whatsapp_360dialog import send_360dialog_text


def _local_time(reservation):
    try:
        restaurant_tz = ZoneInfo(reservation.restaurant.timezone or 'Asia/Dubai')
    except Exception:
        restaurant_tz = ZoneInfo('Asia/Dubai')
    return reservation.reservation_time.astimezone(restaurant_tz)


def _broadcast(reservation):
    channel_layer = get_channel_layer()
    if channel_layer and reservation.restaurant_id:
        async_to_sync(channel_layer.group_send)(
            f'restaurant_{reservation.restaurant_id}',
            {'type': 'reservation_updated', 'reservation': ReservationSerializer(reservation).data},
        )


def process_reservations(now=None):
    current = now or timezone.now()
    counts = {'finished': 0, 'no_show': 0, 'reminder_24h': 0, 'reminder_2h': 0, 'follow_up': 0}

    active = Reservation.objects.select_related('restaurant', 'device').filter(
        status__in=['confirmed', 'accept', 'overdue', 'seated', 'extended']
    )
    for reservation in active:
        if reservation_end(reservation) <= current:
            if reservation.status in {'seated', 'extended'}:
                reservation.status = 'finished'
                reservation.status_reason = 'Dining window completed automatically'
                counts['finished'] += 1
            else:
                reservation.status = 'no_show'
                reservation.status_reason = 'Arrival window elapsed automatically'
                counts['no_show'] += 1
            reservation.actual_end_time = current
            reservation.save(update_fields=['status', 'status_reason', 'actual_end_time', 'updated_at'])
            _broadcast(reservation)
            continue

        until_start = reservation.reservation_time - current
        local = _local_time(reservation)
        if (
            reservation.reminder_24h_sent_at is None
            and timedelta(hours=23, minutes=45) <= until_start <= timedelta(hours=24, minutes=15)
        ):
            body = (
                f"See you tomorrow at {local.strftime('%I:%M %p')} at "
                f"{reservation.restaurant.resturent_name}. Reply CANCEL if plans change."
            )
            if send_360dialog_text(reservation.restaurant, reservation.cell_number, body):
                reservation.reminder_24h_sent_at = current
                reservation.save(update_fields=['reminder_24h_sent_at', 'updated_at'])
                counts['reminder_24h'] += 1
        if (
            reservation.reminder_2h_sent_at is None
            and timedelta(hours=1, minutes=45) <= until_start <= timedelta(hours=2, minutes=15)
        ):
            body = f"Your table is ready for {local.strftime('%I:%M %p')} tonight. See you soon!"
            if send_360dialog_text(reservation.restaurant, reservation.cell_number, body):
                reservation.reminder_2h_sent_at = current
                reservation.save(update_fields=['reminder_2h_sent_at', 'updated_at'])
                counts['reminder_2h'] += 1

    follow_ups = Reservation.objects.select_related('restaurant').filter(
        status='finished', follow_up_sent_at__isnull=True, reservation_time__lt=current - timedelta(hours=20)
    )
    for reservation in follow_ups:
        if reservation.reservation_time < current - timedelta(hours=48):
            continue
        body = "Thank you for visiting. How was your experience? Reply 1 to 5."
        if send_360dialog_text(reservation.restaurant, reservation.cell_number, body):
            reservation.follow_up_sent_at = current
            reservation.save(update_fields=['follow_up_sent_at', 'updated_at'])
            counts['follow_up'] += 1
    return counts


class Command(BaseCommand):
    help = 'Advance reservation lifecycle and send due WhatsApp reminders.'

    def handle(self, *args, **options):
        counts = process_reservations()
        self.stdout.write(self.style.SUCCESS('Reservation processing complete: ' + str(counts)))
