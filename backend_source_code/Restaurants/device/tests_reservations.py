from datetime import datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from device.management.commands.process_reservations import process_reservations
from device.models import Device, Reservation
from device.reservation_services import (
    ReservationConflictError,
    available_slots,
    create_for_available_table,
    create_for_device,
    reschedule,
)
from restaurant.models import Restaurant


class ReservationRuleTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='reservation-owner', email='reservations@example.com', password='test-pass', role='owner'
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name='Reservation Test', location='Test', phone_number='+971500000001',
            owner=self.owner, timezone='UTC', reservation_slot_start=time(18, 0),
            reservation_slot_end=time(22, 0), reservation_duration_minutes=90,
        )
        self.table_user = User.objects.create_user(
            username='reservation-table-1', email='table1@example.com', password='test-pass', role='customer'
        )
        self.table = Device.objects.create(
            table_name='T1', table_number='1', capacity=4, user=self.table_user,
            restaurant=self.restaurant, action='active',
        )

    def _future(self, hour=18, days=2):
        target = timezone.now() + timedelta(days=days)
        return target.replace(hour=hour, minute=0, second=0, microsecond=0)

    def _values(self, name='Guest', phone='+971500000010'):
        return {
            'customer_name': name,
            'cell_number': phone,
            'source': 'dashboard',
            'status': 'confirmed',
        }

    def test_capacity_and_overlapping_confirmed_reservations_are_blocked(self):
        start = self._future()
        first = create_for_device(
            device=self.table, reservation_time=start, guest_no=4, **self._values()
        )
        with self.assertRaises(ReservationConflictError):
            create_for_device(
                device=self.table, reservation_time=start + timedelta(minutes=30), guest_no=2,
                **self._values('Overlap', '+971500000011'),
            )
        with self.assertRaises(ReservationConflictError):
            create_for_device(
                device=self.table, reservation_time=start + timedelta(hours=4), guest_no=5,
                **self._values('Too Large', '+971500000012'),
            )
        self.assertEqual(first.table_capacity, 4)

    def test_available_slots_hide_fully_booked_times(self):
        start = self._future()
        create_for_device(device=self.table, reservation_time=start, guest_no=2, **self._values())
        slots = available_slots(self.restaurant, start.date(), 2)
        slot_times = {slot['time'] for slot in slots}
        self.assertNotIn('18:00', slot_times)
        self.assertNotIn('19:00', slot_times)
        self.assertIn('19:30', slot_times)
        self.assertIn('20:00', slot_times)
        reservation = self.table.reservations.get()
        self.assertEqual(reservation.end_time - reservation.reservation_time, timedelta(minutes=90))

    def test_customer_reschedule_can_reassign_but_never_double_book(self):
        second_user = User.objects.create_user(
            username='reservation-table-2', email='table2@example.com', password='test-pass', role='customer'
        )
        second_table = Device.objects.create(
            table_name='T2', table_number='2', capacity=4, user=second_user,
            restaurant=self.restaurant, action='active',
        )
        start = self._future()
        existing = create_for_device(device=self.table, reservation_time=start, guest_no=2, **self._values())
        movable = create_for_device(
            device=second_table, reservation_time=start + timedelta(hours=3), guest_no=2,
            **self._values('Movable', '+971500000013'),
        )
        updated = reschedule(movable, reservation_time=start, allow_reassign=True)
        self.assertEqual(updated.device_id, second_table.id)
        with self.assertRaises(ReservationConflictError):
            reschedule(existing, reservation_time=start, device=second_table)

    def test_reschedule_resets_time_based_reminders(self):
        start = self._future()
        reservation = create_for_device(
            device=self.table,
            reservation_time=start,
            guest_no=2,
            reminder_24h_sent_at=timezone.now(),
            reminder_2h_sent_at=timezone.now(),
            **self._values(),
        )
        reschedule(reservation, reservation_time=start + timedelta(hours=1))
        reservation.refresh_from_db()
        self.assertIsNone(reservation.reminder_24h_sent_at)
        self.assertIsNone(reservation.reminder_2h_sent_at)

    def test_dashboard_date_filter_uses_restaurant_timezone(self):
        self.restaurant.timezone = 'Asia/Dubai'
        self.restaurant.save(update_fields=['timezone'])
        utc_date = (timezone.now() + timedelta(days=2)).date()
        start = datetime.combine(utc_date, time(23, 30), tzinfo=ZoneInfo('UTC'))
        reservation = create_for_device(
            device=self.table,
            reservation_time=start,
            guest_no=2,
            **self._values('Timezone Guest', '+971500000016'),
        )
        client = APIClient()
        client.force_authenticate(self.owner)

        local_date = start.astimezone(ZoneInfo('Asia/Dubai')).date()
        response = client.get('/owners/reservations/', {'date': local_date.isoformat(), 'page_size': 1000})
        self.assertEqual(response.status_code, 200)
        records = response.data.get('results', response.data)
        self.assertIn(reservation.id, [record['id'] for record in records])

        response = client.get('/owners/reservations/', {'date': utc_date.isoformat(), 'page_size': 1000})
        records = response.data.get('results', response.data)
        self.assertNotIn(reservation.id, [record['id'] for record in records])

    def test_dashboard_analytics_counts_historical_walk_ins_for_selected_week(self):
        self.restaurant.timezone = 'Asia/Dubai'
        self.restaurant.save(update_fields=['timezone'])
        target_date = (timezone.now() - timedelta(days=4)).astimezone(ZoneInfo('Asia/Dubai')).date()
        local_start = datetime.combine(target_date, time(12, 0), tzinfo=ZoneInfo('Asia/Dubai'))

        for index in range(3):
            Reservation.objects.create(
                customer_name=f'Walk-in {index + 1}',
                cell_number='Not provided',
                guest_no=2,
                device=self.table,
                restaurant=self.restaurant,
                source='walk_in',
                status='finished',
                reservation_time=local_start + timedelta(minutes=index * 30),
            )
        Reservation.objects.create(
            customer_name='Booked Guest',
            cell_number='+971500000099',
            guest_no=2,
            device=self.table,
            restaurant=self.restaurant,
            source='dashboard',
            status='confirmed',
            reservation_time=local_start + timedelta(hours=3),
        )
        Reservation.objects.create(
            customer_name='Cancelled Walk-in',
            cell_number='Not provided',
            guest_no=2,
            device=self.table,
            restaurant=self.restaurant,
            source='walk_in',
            status='cancelled',
            reservation_time=local_start + timedelta(hours=4),
        )

        client = APIClient()
        client.force_authenticate(self.owner)
        response = client.get('/owners/reservations/analytics/', {
            'date': target_date.isoformat(),
            'restaurantId': self.restaurant.id,
        })

        self.assertEqual(response.status_code, 200)
        selected_day = next(day for day in response.data['days'] if day['date'] == target_date.isoformat())
        self.assertEqual(selected_day['walkIns'], 3)
        self.assertEqual(selected_day['reservations'], 1)

    @patch('device.management.commands.process_reservations.send_360dialog_text', return_value=True)
    def test_lifecycle_and_reminders_are_idempotent(self, send_text):
        past = timezone.now() - timedelta(hours=3)
        seated = create_for_device(
            device=self.table, reservation_time=past, guest_no=2, status='seated',
            **{key: value for key, value in self._values('Seated').items() if key != 'status'},
        )
        counts = process_reservations()
        seated.refresh_from_db()
        self.assertEqual(seated.status, 'finished')
        self.assertEqual(counts['finished'], 1)

        reminder_start = timezone.now() + timedelta(hours=24)
        reminder = create_for_available_table(
            restaurant=self.restaurant, reservation_time=reminder_start, guest_no=2,
            **self._values('Reminder', '+971500000014'),
        )
        process_reservations()
        reminder.refresh_from_db()
        self.assertIsNotNone(reminder.reminder_24h_sent_at)
        calls_after_first_run = send_text.call_count
        process_reservations()
        self.assertEqual(send_text.call_count, calls_after_first_run)

    @patch('device.management.commands.process_reservations.send_360dialog_text', return_value=True)
    @patch('device.management.commands.process_reservations.send_360dialog_template', return_value=True)
    def test_reminders_use_approved_template_when_configured(self, send_template, send_text):
        self.restaurant.whatsapp_special_phrases = {
            'reminder24hTemplate': 'reservation_reminder_24h',
            'templateLanguage': 'en',
        }
        self.restaurant.save(update_fields=['whatsapp_special_phrases'])
        reminder_start = timezone.now() + timedelta(hours=24)
        create_for_available_table(
            restaurant=self.restaurant,
            reservation_time=reminder_start,
            guest_no=2,
            **self._values('Template Reminder', '+971500000015'),
        )

        process_reservations()

        send_template.assert_called_once()
        self.assertEqual(send_template.call_args.args[2], 'reservation_reminder_24h')
        send_text.assert_not_called()

    @patch('device.management.commands.process_reservations.send_360dialog_text', return_value=True)
    @patch('device.management.commands.process_reservations.send_360dialog_template', return_value=True)
    def test_follow_up_template_receives_restaurant_name(self, send_template, send_text):
        self.restaurant.whatsapp_special_phrases = {
            'followUpTemplate': 'reservation_follow_up',
            'templateLanguage': 'en',
        }
        self.restaurant.save(update_fields=['whatsapp_special_phrases'])
        create_for_available_table(
            restaurant=self.restaurant,
            reservation_time=timezone.now() - timedelta(hours=21),
            guest_no=2,
            status='finished',
            **{key: value for key, value in self._values('Follow-up Guest', '+971500000017').items() if key != 'status'},
        )

        process_reservations()

        send_template.assert_called_once()
        self.assertEqual(send_template.call_args.args[2], 'reservation_follow_up')
        self.assertEqual(send_template.call_args.kwargs['body_parameters'], [self.restaurant.resturent_name])
        send_text.assert_not_called()
