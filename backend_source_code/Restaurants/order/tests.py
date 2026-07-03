import shutil
import tempfile
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from accounts.models import User
from category.models import Category
from device.models import Device, GuestSession
from item.models import Item
from restaurant.models import BrandConfig, Restaurant

from .models import UpsellEvent
from .upsell_views import UpsellAnalyticsAPIView


class PayBeforeOrderFlowTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="prepay-owner@example.com",
            username="Prepay Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Prepay Restaurant",
            location="Dubai",
            phone_number="+971500009999",
            owner=self.owner,
        )
        self.brand_config = BrandConfig.objects.create(
            restaurant=self.restaurant,
            pay_before_order=True,
        )
        with patch("device.models.Device.generate_qr_code"):
            self.device = Device.objects.create(
                table_name="Table 1",
                user=self.owner,
                restaurant=self.restaurant,
            )
        self.session = GuestSession.objects.create(
            device=self.device,
            session_token="prepay-session-token",
        )
        category = Category.objects.create(
            restaurant=self.restaurant,
            Category_name="Mains",
            slug="mains",
        )
        self.item = Item.objects.create(
            restaurant=self.restaurant,
            category=category,
            item_name="Test Main",
            description="Test item",
            slug="test-main",
            price="25.00",
        )
        self.client = APIClient()

    def _place_order(self, payment_method="card"):
        return self.client.post(
            f"/api/customer/orders/?guest_token={self.session.session_token}",
            {
                "order_items": [{"item": self.item.id, "quantity": 1}],
                "guest_session_token": self.session.session_token,
                "payment_method": payment_method,
            },
            format="json",
            HTTP_X_GUEST_SESSION_TOKEN=self.session.session_token,
        )

    def test_card_prepayment_order_waits_outside_kitchen_queue(self):
        response = self._place_order("card")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "awaiting_payment")

        self.client.force_authenticate(self.owner)
        owner_response = self.client.get("/owners/orders/")
        self.assertEqual(owner_response.status_code, 200)
        owner_orders = owner_response.json()["results"]["orders"]
        self.assertEqual(owner_orders, [])

    def test_post_meal_order_remains_immediately_visible(self):
        self.brand_config.pay_before_order = False
        self.brand_config.save(update_fields=["pay_before_order"])

        response = self._place_order("card")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "pending")

        self.client.force_authenticate(self.owner)
        owner_response = self.client.get("/owners/orders/")
        owner_orders = owner_response.json()["results"]["orders"]
        self.assertEqual(len(owner_orders), 1)


class UpsellAnalyticsImageTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.media_root = tempfile.mkdtemp()
        cls.settings_override = override_settings(MEDIA_ROOT=cls.media_root)
        cls.settings_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.settings_override.disable()
        shutil.rmtree(cls.media_root, ignore_errors=True)

    def setUp(self):
        self.owner = User.objects.create_user(
            email="upsell-owner@example.com",
            username="Upsell Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Image Test Restaurant",
            location="Test location",
            phone_number="+971500000001",
            owner=self.owner,
        )
        category = Category.objects.create(
            restaurant=self.restaurant,
            Category_name="Desserts",
            slug="desserts",
        )
        self.item = Item.objects.create(
            restaurant=self.restaurant,
            category=category,
            item_name="Uploaded Sundae",
            description="Test item",
            slug="uploaded-sundae",
            price="12.00",
            image1=SimpleUploadedFile("sundae.png", b"test-image-content", content_type="image/png"),
        )
        UpsellEvent.objects.create(
            restaurant=self.restaurant,
            session_id="image-test-session",
            trigger_point="cart",
            action="shown",
            upsell_item=self.item,
            upsell_item_name=self.item.item_name,
            upsell_category="Desserts",
            upsell_price=self.item.price,
        )

    def test_top_item_includes_uploaded_item_image_url(self):
        request = APIRequestFactory().get("/api/upsell/analytics")
        force_authenticate(request, user=self.owner)

        response = UpsellAnalyticsAPIView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["top_items"]), 1)
        top_item = response.data["top_items"][0]
        self.assertEqual(top_item["item_id"], self.item.id)
        self.assertEqual(
            top_item["image_url"],
            f"http://testserver{self.item.image1.url}",
        )
