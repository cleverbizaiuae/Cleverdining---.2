from datetime import time, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from device.management.commands.process_reservations import process_reservations
from device.models import Device
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
        self.assertNotIn('19:30', slot_times)
        self.assertIn('20:00', slot_times)

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
