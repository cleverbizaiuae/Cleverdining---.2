from datetime import time
from unittest.mock import Mock, patch
from urllib.parse import unquote

import requests
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


class GenerateImageTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='image-owner',
            email='image@example.com',
            password='test-pass',
            role='owner',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    @patch('owners.views.requests.get')
    def test_retries_a_transient_provider_failure(self, get_image):
        image_response = Mock()
        image_response.headers = {'Content-Type': 'image/jpeg'}
        image_response.content = b'\xff\xd8\xff' + (b'x' * 2048)
        image_response.raise_for_status.return_value = None
        get_image.side_effect = [requests.exceptions.Timeout(), image_response]

        response = self.client.post(
            '/owners/generate-image/',
            {'prompt': 'Iced coffee'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['image'].startswith('data:image/jpeg;base64,'))
        self.assertEqual(get_image.call_count, 2)
        self.assertEqual(get_image.call_args.kwargs['timeout'], (5, 20))

    @patch('owners.views.requests.get')
    def test_generation_prompt_requires_the_named_menu_item(self, get_image):
        image_response = Mock()
        image_response.headers = {'Content-Type': 'image/jpeg'}
        image_response.content = b'\xff\xd8\xff' + (b'x' * 2048)
        image_response.raise_for_status.return_value = None
        get_image.return_value = image_response

        response = self.client.post(
            '/owners/generate-image/',
            {'prompt': 'Fruit Salad'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        called_url = get_image.call_args.args[0]
        encoded_prompt = called_url.split('/prompt/', 1)[1].split('?', 1)[0]
        provider_prompt = unquote(encoded_prompt)
        self.assertIn('exactly this food or drink item: Fruit Salad', provider_prompt)
        self.assertIn('The main subject must clearly match Fruit Salad', provider_prompt)
        self.assertIn('Do not include unrelated menu items', provider_prompt)

    @patch('owners.views.requests.get')
    def test_returns_a_clear_error_after_all_retries_fail(self, get_image):
        get_image.side_effect = requests.exceptions.ConnectionError()

        response = self.client.post(
            '/owners/generate-image/',
            {'prompt': 'Iced coffee'},
            format='json',
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.data['error'],
            'Image generation is temporarily unavailable. Please try again.',
        )
        self.assertEqual(get_image.call_count, 3)
