from datetime import time

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from restaurant.models import Restaurant


class RestaurantReservationSettingsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='settings-owner',
            email='settings@example.com',
            password='test-pass',
            role='owner',
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name='Settings Test',
            location='Dubai',
            phone_number='+971500000099',
            owner=self.owner,
            google_review_url='https://example.com/review',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_reservation_settings_are_visible_and_editable_without_clearing_reviews(self):
        response = self.client.get('/owners/restaurant-settings/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['reservation_duration_minutes'], 90)
        self.assertEqual(response.data['reservation_slot_start'], '18:00')
        self.assertEqual(response.data['reservation_slot_end'], '22:00')

        response = self.client.patch(
            '/owners/restaurant-settings/',
            {
                'reservation_duration_minutes': 120,
                'reservation_slot_start': '17:30',
                'reservation_slot_end': '23:00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.reservation_duration_minutes, 120)
        self.assertEqual(self.restaurant.reservation_slot_start, time(17, 30))
        self.assertEqual(self.restaurant.reservation_slot_end, time(23, 0))
        self.assertEqual(self.restaurant.google_review_url, 'https://example.com/review')

    def test_invalid_reservation_settings_are_rejected(self):
        response = self.client.patch(
            '/owners/restaurant-settings/',
            {'reservation_duration_minutes': 5},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.patch(
            '/owners/restaurant-settings/',
            {'reservation_slot_start': '22:00', 'reservation_slot_end': '18:00'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
