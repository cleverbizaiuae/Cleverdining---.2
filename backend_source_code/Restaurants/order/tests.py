import json
import shutil
import tempfile
from unittest.mock import Mock, patch

import requests

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from accounts.models import User
from category.models import Category
from device.models import Device, GuestSession
from item.models import Item
from restaurant.models import BrandConfig, Restaurant

from .models import UpsellEvent, UpsellLLMDecision
from . import upsell as upsell_module
from .upsell import build_item_context_upsell_suggestions, get_restaurant_menu_intelligence
from .upsell_cache import get_restaurant_upsell_cache_versions
from .upsell_precompute import (
    build_precomputed_source_context,
    precompute_source_item_upsell_batch,
)
from .upsell_knowledge import (
    _upsell_llm_decision_cache_key,
    build_upsell_agent_context,
    call_upsell_llm,
    classify_item_roles,
    infer_venue_type,
    request_upsell_llm_decision,
    validated_upsell_agent_decision,
)
from .upsell_views import UpsellAnalyticsAPIView, UpsellSmartSuggestionsAPIView


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


class UpsellKnowledgeEngineTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="knowledge-upsell-owner@example.com",
            username="Knowledge Upsell Owner",
            password="test-password",
            role="owner",
        )
        self.restaurant = Restaurant.objects.create(
            resturent_name="Knowledge Upsell Restaurant",
            location="Dubai",
            phone_number="+971500000002",
            owner=self.owner,
        )
        self.main_category = Category.objects.create(
            restaurant=self.restaurant,
            Category_name="Mains",
            slug="knowledge-mains",
            category_type="main",
        )
        self.drink_category = Category.objects.create(
            restaurant=self.restaurant,
            Category_name="Drinks",
            slug="knowledge-drinks",
            category_type="drink",
        )
        self.dessert_category = Category.objects.create(
            restaurant=self.restaurant,
            Category_name="Desserts",
            slug="knowledge-desserts",
            category_type="dessert",
        )
        self.starter_category = Category.objects.create(
            restaurant=self.restaurant,
            Category_name="Starters",
            slug="knowledge-starters",
            category_type="starter",
        )
        self.shisha_category = Category.objects.create(
            restaurant=self.restaurant,
            Category_name="Shisha",
            slug="knowledge-shisha",
            category_type="premium",
        )
        self.burger = self._item("Classic Burger", self.main_category, "classic-burger", "Burger main dish", "35.00")
        self.pizza = self._item("Margherita Pizza", self.main_category, "margherita-pizza", "Pizza main dish", "39.00")
        self.cola = self._item("Cola", self.drink_category, "cola", "Cold cola drink", "10.00")
        self.lemonade = self._item("Lemonade", self.drink_category, "lemonade", "Fresh juice drink", "14.00")
        self.cappuccino = self._item("Cappuccino", self.drink_category, "cappuccino", "Hot coffee drink", "12.00")
        self.ice_cream = self._item("Vanilla Ice Cream", self.dessert_category, "vanilla-ice-cream", "Dessert", "16.00")
        self.fries = self._item("Fries", self.starter_category, "fries", "Starter side", "12.00")
        self.shisha = self._item("Double Apple Shisha", self.shisha_category, "double-apple-shisha", "Shisha flavour", "75.00")

    def _item(self, name, category, slug, description, price):
        return Item.objects.create(
            restaurant=self.restaurant,
            category=category,
            item_name=name,
            description=description,
            slug=slug,
            price=price,
        )

    def _result_roles(self, rows):
        roles = []
        for row in rows:
            item = row["item"]
            roles.append(item.category.category_type)
        return roles

    def test_menu_intelligence_is_cached_and_invalidated_after_item_change(self):
        first_versions = get_restaurant_upsell_cache_versions(self.restaurant.id)
        first = get_restaurant_menu_intelligence(self.restaurant)
        second = get_restaurant_menu_intelligence(self.restaurant)

        self.assertFalse(first["cache_hit"])
        self.assertTrue(second["cache_hit"])
        self.assertIn(str(self.lemonade.id), second["items"])
        self.assertIn(str(self.cola.id), second["pair_compatibility"].get(str(self.burger.id), {}))

        self.lemonade.availability = False
        self.lemonade.save(update_fields=["availability", "updated_time"])

        next_versions = get_restaurant_upsell_cache_versions(self.restaurant.id)
        refreshed = get_restaurant_menu_intelligence(self.restaurant)
        self.assertGreater(next_versions[0], first_versions[0])
        self.assertFalse(refreshed["cache_hit"])
        self.assertNotIn(str(self.lemonade.id), refreshed["items"])

    def test_candidate_shortlist_is_reused_for_identical_cart_context(self):
        original_builder = upsell_module._build_upsell_suggestions_for_items
        with patch(
            "order.upsell._build_upsell_suggestions_for_items",
            wraps=original_builder,
        ) as builder:
            first = build_item_context_upsell_suggestions(
                self.restaurant,
                [self.burger.id],
                trigger_point="cart",
                source_item_id=self.burger.id,
                limit=5,
                apply_surface_limit=False,
            )
            second = build_item_context_upsell_suggestions(
                self.restaurant,
                [self.burger.id],
                trigger_point="cart",
                source_item_id=self.burger.id,
                limit=5,
                apply_surface_limit=False,
            )

        self.assertEqual(builder.call_count, 1)
        self.assertEqual(
            [row["item"].id for row in first],
            [row["item"].id for row in second],
        )

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="openrouter/free",
        OPENROUTER_UPSELL_PAID_FALLBACK_MODELS="mistralai/mistral-nemo",
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=True,
    )
    def test_batch_warm_persists_multiple_llm_decisions_with_one_request(self):
        prepared = [
            build_precomputed_source_context(self.restaurant, source_item)
            for source_item in (self.burger, self.pizza)
        ]
        decisions = []
        for source_item, entry in zip((self.burger, self.pizza), prepared):
            candidate = entry["context"]["candidates"][0]
            decisions.append({
                "source_item_id": source_item.id,
                "suggest_nothing": False,
                "suggested_item_id": candidate["id"],
                "suggested_item_name": candidate["name"],
                "target_role": candidate["target_role"],
                "reason": None,
                "reasoning": "Best valid complement.",
                "suggestion_copy": "A balanced addition for your order.",
                "confidence": 0.9,
            })
        response = Mock(status_code=200)
        response.json.return_value = {
            "model": "mistralai/mistral-nemo",
            "choices": [{"message": {"content": json.dumps({"decisions": decisions})}}],
        }

        with patch("order.upsell_knowledge.requests.post", return_value=response) as post:
            result = precompute_source_item_upsell_batch(
                self.restaurant.id,
                [self.burger.id, self.pizza.id],
                force_refresh=True,
            )

        self.assertEqual(post.call_count, 1)
        self.assertEqual([row["status"] for row in result["results"]], ["ok", "ok"])
        self.assertEqual(
            set(UpsellLLMDecision.objects.values_list("source_item_id", flat=True)),
            {self.burger.id, self.pizza.id},
        )
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["model"], "mistralai/mistral-nemo")
        self.assertEqual(payload["response_format"], {"type": "json_object"})

    def test_menu_version_prevents_stale_llm_decision_reuse(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=5,
            apply_surface_limit=False,
        )
        first_context = self._agent_context(rows)
        first_key = _upsell_llm_decision_cache_key(
            first_context,
            f"restaurant:{self.restaurant.id}",
        )

        self.cola.price = "11.00"
        self.cola.save(update_fields=["price", "updated_time"])
        refreshed_rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=5,
            apply_surface_limit=False,
        )
        next_context = self._agent_context(refreshed_rows)
        next_key = _upsell_llm_decision_cache_key(
            next_context,
            f"restaurant:{self.restaurant.id}",
        )

        self.assertNotEqual(first_context["knowledge_version"], next_context["knowledge_version"])
        self.assertNotEqual(first_key, next_key)

    def test_main_only_suggests_drink_and_never_another_main(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="add_to_cart",
            source_item_id=self.burger.id,
            limit=3,
        )

        self.assertGreater(len(rows), 0)
        self.assertEqual(rows[0]["item"].category.category_type, "drink")
        self.assertNotIn("main", self._result_roles(rows))

    def test_category_is_authoritative_over_pairing_words_in_description(self):
        tiramisu = self._item(
            "Classic Tiramisu",
            self.dessert_category,
            "classic-tiramisu",
            "Mascarpone dessert layered with espresso-soaked sponge.",
            "24.00",
        )

        self.assertEqual(classify_item_roles(tiramisu), {"DESSERT"})
        self.assertEqual(infer_venue_type(self.restaurant, [tiramisu]), "restaurant")

    def test_main_and_drink_suggests_dessert_or_starter_not_existing_roles(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id, self.cola.id],
            trigger_point="cart",
            source_item_id=self.cola.id,
            limit=4,
        )

        self.assertGreater(len(rows), 0)
        roles = self._result_roles(rows)
        self.assertEqual(roles[0], "dessert")
        self.assertNotIn("main", roles)
        self.assertNotIn("drink", roles)

    def test_drink_only_suggests_main(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.cola.id],
            trigger_point="add_to_cart",
            source_item_id=self.cola.id,
            limit=3,
        )

        self.assertGreater(len(rows), 0)
        self.assertEqual(rows[0]["item"].category.category_type, "main")

    def test_repeated_category_declines_suppress_that_category(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
            session_signals={
                "category_declines": {str(self.drink_category.id): 2},
                "category_views": {},
                "recently_removed_category_ids": [],
            },
        )

        roles = self._result_roles(rows)
        self.assertNotIn("drink", roles)
        self.assertTrue(any(role in {"dessert", "starter"} for role in roles))

    def test_hot_drink_only_suggests_dessert_or_light_food_not_main(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.cappuccino.id],
            trigger_point="cart",
            source_item_id=self.cappuccino.id,
            limit=4,
        )

        self.assertGreater(len(rows), 0)
        roles = self._result_roles(rows)
        self.assertNotIn("main", roles)
        self.assertIn(rows[0]["target_role"], {"DESSERT", "STARTER"})

    def test_shisha_only_suggests_cold_drink_before_food(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.shisha.id],
            trigger_point="cart",
            source_item_id=self.shisha.id,
            limit=4,
        )

        self.assertGreater(len(rows), 0)
        self.assertEqual(rows[0]["item"].category.category_type, "drink")
        self.assertEqual(rows[0]["target_role"], "DRINK_COLD")

    def test_complete_meal_with_side_suggests_nothing(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id, self.cola.id, self.ice_cream.id, self.fries.id],
            trigger_point="cart",
            source_item_id=self.fries.id,
            limit=4,
        )

        self.assertEqual(rows, [])

    def test_invalid_llm_decision_returns_no_recommendation(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )

        decision = validated_upsell_agent_decision(
            {
                "suggest_nothing": False,
                "suggested_item_id": "999999",
                "suggestion_copy": "Add a fake item?",
                "confidence": 0.99,
            },
            rows,
        )

        self.assertTrue(decision["suggest_nothing"])
        self.assertEqual(decision["decision_source"], "llm_invalid")
        self.assertNotIn("suggested_item_id", decision)

    def test_llm_cannot_fall_back_to_backend_copy_when_copy_is_missing(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[0]

        decision = validated_upsell_agent_decision(
            {
                "suggest_nothing": False,
                "suggested_item_id": chosen["item"].id,
                "suggested_item_name": chosen["item"].item_name,
                "target_role": chosen["target_role"],
                "reason": None,
                "reasoning": "This is the strongest fit.",
                "suggestion_copy": None,
                "confidence": 0.9,
            },
            rows,
            llm_status="ok",
        )

        self.assertTrue(decision["suggest_nothing"])
        self.assertEqual(decision["decision_source"], "llm_invalid")
        self.assertNotIn("suggestion_copy", decision)

    def test_agent_context_matches_documented_request_sections(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="add_to_cart",
            source_item_id=self.burger.id,
            limit=5,
            apply_surface_limit=False,
        )
        context = build_upsell_agent_context(
            restaurant=self.restaurant,
            setting=self.restaurant.upsell_setting,
            cart_items=[self.burger],
            candidate_rows=rows,
            trigger_point="add_to_cart",
            hour=13,
            source_item_id=self.burger.id,
            session_signals={
                "suggestions_shown": 1,
                "declined_roles": ["DESSERT"],
                "declined_item_ids": [self.ice_cream.id],
                "excluded_item_ids": [self.ice_cream.id],
            },
        )

        self.assertLessEqual(len(context["candidates"]), 5)
        self.assertEqual(context["trigger"]["source_item_id"], self.burger.id)
        self.assertEqual(context["session"]["suggestions_shown"], 1)
        self.assertIn("DESSERT", context["session"]["declined_roles"])
        self.assertIn("current_time", context["restaurant"])
        self.assertIn("current_day", context["restaurant"])
        self.assertIn("smart_rules", context)
        self.assertIn("pairing_summary", context)
        self.assertIn("acceptance_rate", context["candidates"][0])
        self.assertIn("order_count_7d", context["candidates"][0])
        self.assertIn("VALID CANDIDATE SHORTLIST", context["user_message"])

    def _agent_context(self, rows):
        setting = self.restaurant.upsell_setting
        return build_upsell_agent_context(
            restaurant=self.restaurant,
            setting=setting,
            cart_items=[self.burger],
            candidate_rows=rows,
            trigger_point="cart",
            hour=13,
        )

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="openrouter/free",
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=False,
        OPENROUTER_UPSELL_TIMEOUT_SECONDS=1.0,
    )
    def test_openrouter_free_decision_is_structured_and_validated(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[-1]["item"]
        response = Mock(status_code=200)
        response.json.return_value = {
            "model": "qwen/qwen3-4b:free",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":"%d",'
                    '"suggested_item_name":"non-canonical name","target_role":null,'
                    '"reason":null,"reasoning":"Best valid match.",'
                    '"suggestion_copy":"A crisp finish for your meal.","confidence":"0.91"}'
                )
                % chosen.id}
            }],
        }

        with patch("order.upsell_knowledge.requests.post", return_value=response) as post:
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertEqual(llm_status, "ok")
        self.assertEqual(decision["decision_source"], "llm")
        self.assertEqual(decision["suggested_item_id"], chosen.id)
        self.assertEqual(raw_decision["suggested_item_name"], chosen.item_name)
        self.assertEqual(raw_decision["target_role"], rows[-1]["target_role"])
        self.assertEqual(raw_decision["confidence"], 0.91)
        self.assertEqual(raw_decision["_llm_provider"], "openrouter")
        self.assertEqual(raw_decision["_llm_model"], "qwen/qwen3-4b:free")
        self.assertEqual(post.call_args.args[0], "https://openrouter.ai/api/v1/chat/completions")
        self.assertEqual(post.call_args.kwargs["json"]["model"], "openrouter/free")
        self.assertEqual(post.call_args.kwargs["json"]["response_format"], {"type": "json_object"})
        self.assertEqual(post.call_args.kwargs["json"]["temperature"], 0.2)
        self.assertEqual(post.call_args.kwargs["json"]["max_tokens"], 220)
        self.assertEqual(
            post.call_args.kwargs["headers"]["X-OpenRouter-Title"],
            "CleverDining AI Upsell",
        )

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="nvidia/nemotron-3-super-120b-a12b:free",
        OPENROUTER_UPSELL_FALLBACK_MODELS="openrouter/free",
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=False,
        OPENROUTER_UPSELL_TIMEOUT_SECONDS=1.0,
    )
    def test_openrouter_rate_limit_uses_free_router_for_final_llm_decision(self):
        cache.delete("upsell:openrouter:free-rate-limited")
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[0]["item"]
        rate_limited = Mock(status_code=429)
        fallback_response = Mock(status_code=200)
        fallback_response.json.return_value = {
            "model": "qwen/qwen3-4b:free",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"%s",'
                    '"reason":null,"reasoning":"Best valid complement.",'
                    '"suggestion_copy":"A refreshing match to round out your meal.","confidence":0.9}'
                ) % (chosen.id, chosen.item_name, rows[0]["target_role"])}
            }],
        }

        with patch(
            "order.upsell_knowledge.requests.post",
            side_effect=[rate_limited, fallback_response],
        ) as post:
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertEqual(llm_status, "ok")
        self.assertEqual(decision["decision_source"], "llm")
        self.assertEqual(decision["suggested_item_id"], chosen.id)
        self.assertEqual(post.call_count, 2)
        self.assertEqual(
            [call.kwargs["json"]["model"] for call in post.call_args_list],
            ["nvidia/nemotron-3-super-120b-a12b:free", "openrouter/free"],
        )

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="nvidia/nemotron-3-super-120b-a12b:free",
        OPENROUTER_UPSELL_FALLBACK_MODELS="openrouter/free",
        OPENROUTER_UPSELL_PAID_FALLBACK_MODELS=(
            "mistralai/mistral-nemo,meta-llama/llama-3.1-8b-instruct"
        ),
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=False,
        OPENROUTER_UPSELL_TIMEOUT_SECONDS=1.0,
    )
    def test_openrouter_free_quota_uses_low_cost_llm_for_final_decision(self):
        cache.delete("upsell:openrouter:free-rate-limited")
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[0]["item"]
        rate_limited = Mock(status_code=429)
        unavailable_model = Mock(status_code=404)
        paid_response = Mock(status_code=200)
        paid_response.json.return_value = {
            "model": "meta-llama/llama-3.1-8b-instruct",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"%s",'
                    '"reason":null,"reasoning":"Best valid complement.",'
                    '"suggestion_copy":"A refreshing match for your meal.","confidence":0.9}'
                ) % (chosen.id, chosen.item_name, rows[0]["target_role"])}
            }],
        }

        with patch(
            "order.upsell_knowledge.requests.post",
            side_effect=[rate_limited, rate_limited, unavailable_model, paid_response],
        ) as post:
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertEqual(llm_status, "ok")
        self.assertEqual(decision["decision_source"], "llm")
        self.assertEqual(decision["suggested_item_id"], chosen.id)
        self.assertEqual(
            [call.kwargs["json"]["model"] for call in post.call_args_list],
            [
                "nvidia/nemotron-3-super-120b-a12b:free",
                "openrouter/free",
                "mistralai/mistral-nemo",
                "meta-llama/llama-3.1-8b-instruct",
            ],
        )
        self.assertTrue(cache.get("upsell:openrouter:free-rate-limited"))

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="nvidia/nemotron-3-super-120b-a12b:free",
        OPENROUTER_UPSELL_FALLBACK_MODELS="openrouter/free",
        OPENROUTER_UPSELL_PAID_FALLBACK_MODELS="mistralai/mistral-nemo",
        OPENROUTER_UPSELL_TIMEOUT_SECONDS=1.0,
    )
    def test_openrouter_cooldown_skips_known_rate_limited_free_models(self):
        cache.set("upsell:openrouter:free-rate-limited", True, timeout=300)
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[0]["item"]
        paid_response = Mock(status_code=200)
        paid_response.json.return_value = {
            "model": "mistralai/mistral-nemo",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"%s",'
                    '"reason":null,"reasoning":"Best valid complement.",'
                    '"suggestion_copy":"A refreshing match for your meal.","confidence":0.9}'
                ) % (chosen.id, chosen.item_name, rows[0]["target_role"])}
            }],
        }

        with patch("order.upsell_knowledge.requests.post", return_value=paid_response) as post:
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertEqual(llm_status, "ok")
        self.assertEqual(decision["decision_source"], "llm")
        self.assertEqual(post.call_count, 1)
        self.assertEqual(
            post.call_args.kwargs["json"]["model"],
            "mistralai/mistral-nemo",
        )
        cache.delete("upsell:openrouter:free-rate-limited")

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="nvidia/nemotron-3-super-120b-a12b:free",
        OPENROUTER_UPSELL_FALLBACK_MODELS="openrouter/free",
        OPENROUTER_UPSELL_PAID_FALLBACK_MODELS="mistralai/mistral-nemo",
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=True,
        OPENROUTER_UPSELL_TIMEOUT_SECONDS=1.0,
        OPENROUTER_UPSELL_TOTAL_TIMEOUT_SECONDS=2.0,
    )
    def test_openrouter_prefers_low_latency_model_for_customer_requests(self):
        cache.delete("upsell:openrouter:free-rate-limited")
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[0]["item"]
        response = Mock(status_code=200)
        response.json.return_value = {
            "model": "mistralai/mistral-nemo",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"%s",'
                    '"reason":null,"reasoning":"Best valid complement.",'
                    '"suggestion_copy":"A refreshing match for your meal.","confidence":0.9}'
                ) % (chosen.id, chosen.item_name, rows[0]["target_role"])}
            }],
        }

        with patch("order.upsell_knowledge.requests.post", return_value=response) as post:
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertEqual(decision["decision_source"], "llm")
        self.assertEqual(post.call_count, 1)
        self.assertEqual(
            post.call_args.kwargs["json"]["model"],
            "mistralai/mistral-nemo",
        )
        self.assertEqual(
            post.call_args.kwargs["json"]["provider"]["sort"],
            {"by": "latency", "partition": "none"},
        )
        self.assertEqual(
            post.call_args.kwargs["json"]["provider"]["preferred_max_latency"],
            {"p90": 3},
        )
        self.assertEqual(
            post.call_args.kwargs["json"]["provider"]["max_price"],
            {"prompt": 0.2, "completion": 0.8},
        )
        response_format = post.call_args.kwargs["json"]["response_format"]
        self.assertEqual(response_format["type"], "json_schema")
        self.assertTrue(response_format["json_schema"]["strict"])
        self.assertEqual(
            response_format["json_schema"]["schema"]["additionalProperties"],
            False,
        )
        self.assertTrue(post.call_args.kwargs["json"]["provider"]["require_parameters"])
        self.assertLessEqual(post.call_args.kwargs["timeout"], 1.0)

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="nvidia/nemotron-3-super-120b-a12b:free",
        OPENROUTER_UPSELL_FAST_FREE_MODELS="meta-llama/llama-3.2-3b-instruct:free",
        OPENROUTER_UPSELL_PAID_FALLBACK_MODELS="",
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=True,
        UPSELL_LLM_DECISION_CACHE_SECONDS=300,
    )
    def test_openrouter_reuses_llm_decision_across_surfaces_for_same_session_cart(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[0]["item"]
        response = Mock(status_code=200)
        response.json.return_value = {
            "model": "meta-llama/llama-3.2-3b-instruct:free",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"%s",'
                    '"reason":null,"reasoning":"Best valid complement.",'
                    '"suggestion_copy":"A refreshing match for your meal.","confidence":0.9}'
                ) % (chosen.id, chosen.item_name, rows[0]["target_role"])}
            }],
        }
        context = self._agent_context(rows)
        cache_scope = f"cache-test-{self.restaurant.id}"

        with patch("order.upsell_knowledge.requests.post", return_value=response) as post:
            first_decision, first_status = call_upsell_llm(context, cache_scope=cache_scope)
            context["trigger_point"] = "add_to_cart"
            context["trigger"]["point"] = "add_to_cart"
            second_decision, second_status = call_upsell_llm(context, cache_scope=cache_scope)

        self.assertEqual(first_status, "ok")
        self.assertEqual(second_status, "ok")
        self.assertEqual(post.call_count, 1)
        self.assertEqual(first_decision["suggested_item_id"], chosen.id)
        self.assertEqual(second_decision["suggested_item_id"], chosen.id)
        self.assertTrue(second_decision["_llm_cache_hit"])

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="meta-llama/llama-3.2-3b-instruct:free",
        OPENROUTER_UPSELL_FAST_FREE_MODELS="meta-llama/llama-3.2-3b-instruct:free",
        OPENROUTER_UPSELL_PAID_FALLBACK_MODELS="",
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=True,
        UPSELL_LLM_DECISION_CACHE_SECONDS=300,
    )
    def test_llm_decision_survives_process_cache_loss(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="add_to_cart",
            source_item_id=self.burger.id,
            limit=4,
            apply_surface_limit=False,
        )
        chosen = rows[0]["item"]
        response = Mock(status_code=200)
        response.json.return_value = {
            "model": "meta-llama/llama-3.2-3b-instruct:free",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"%s",'
                    '"reason":null,"reasoning":"Best valid complement.",'
                    '"suggestion_copy":"A refreshing match for your meal.","confidence":0.9}'
                ) % (chosen.id, chosen.item_name, rows[0]["target_role"])}
            }],
        }
        context = build_upsell_agent_context(
            restaurant=self.restaurant,
            setting=self.restaurant.upsell_setting,
            cart_items=[self.burger],
            candidate_rows=rows,
            trigger_point="add_to_cart",
            hour=13,
            source_item_id=self.burger.id,
        )
        cache_scope = f"persistent-cache-test-{self.restaurant.id}"

        with patch("order.upsell_knowledge.requests.post", return_value=response) as post:
            first_decision, first_status = call_upsell_llm(context, cache_scope=cache_scope)
            cache.clear()
            second_decision, second_status = call_upsell_llm(context, cache_scope=cache_scope)

        self.assertEqual(first_status, "ok")
        self.assertEqual(second_status, "ok")
        self.assertEqual(post.call_count, 1)
        self.assertEqual(UpsellLLMDecision.objects.count(), 1)
        self.assertEqual(first_decision["suggested_item_id"], chosen.id)
        self.assertEqual(second_decision["suggested_item_id"], chosen.id)
        self.assertTrue(second_decision["_llm_persistent_cache_hit"])

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="meta-llama/llama-3.2-3b-instruct:free",
        OPENROUTER_UPSELL_FAST_FREE_MODELS="meta-llama/llama-3.2-3b-instruct:free",
        OPENROUTER_UPSELL_PAID_FALLBACK_MODELS="",
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=True,
    )
    def test_cart_reuses_valid_llm_choice_precomputed_for_a_cart_item(self):
        source_rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="add_to_cart",
            source_item_id=self.burger.id,
            limit=5,
            apply_surface_limit=False,
        )
        cart_rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id, self.pizza.id],
            trigger_point="cart",
            source_item_id=self.pizza.id,
            limit=5,
            apply_surface_limit=False,
        )
        cart_row_ids = {row["item"].id for row in cart_rows}
        chosen_row = next(row for row in source_rows if row["item"].id in cart_row_ids)
        chosen = chosen_row["item"]
        response = Mock(status_code=200)
        response.json.return_value = {
            "model": "meta-llama/llama-3.2-3b-instruct:free",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"%s",'
                    '"reason":null,"reasoning":"Best valid complement.",'
                    '"suggestion_copy":"A refreshing match for your meal.","confidence":0.9}'
                ) % (chosen.id, chosen.item_name, chosen_row["target_role"])}
            }],
        }
        source_context = build_upsell_agent_context(
            restaurant=self.restaurant,
            setting=self.restaurant.upsell_setting,
            cart_items=[self.burger],
            candidate_rows=source_rows,
            trigger_point="add_to_cart",
            hour=13,
            source_item_id=self.burger.id,
        )
        cart_context = build_upsell_agent_context(
            restaurant=self.restaurant,
            setting=self.restaurant.upsell_setting,
            cart_items=[self.burger, self.pizza],
            candidate_rows=cart_rows,
            trigger_point="cart",
            hour=13,
            source_item_id=self.pizza.id,
        )
        cache_scope = f"cart-source-cache-test-{self.restaurant.id}"

        with patch("order.upsell_knowledge.requests.post", return_value=response) as post:
            first_decision, first_status = call_upsell_llm(source_context, cache_scope=cache_scope)
            cache.clear()
            second_decision, second_status = call_upsell_llm(cart_context, cache_scope=cache_scope)

        self.assertEqual(first_status, "ok")
        self.assertEqual(second_status, "ok")
        self.assertEqual(post.call_count, 1)
        self.assertEqual(first_decision["suggested_item_id"], chosen.id)
        self.assertEqual(second_decision["suggested_item_id"], chosen.id)
        self.assertEqual(second_decision["_llm_persistent_cache_source"], "cart_source_item")

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
        OPENROUTER_UPSELL_MODEL="openrouter/free",
        OPENROUTER_UPSELL_PAID_FALLBACK_MODELS="mistralai/mistral-nemo",
        OPENROUTER_UPSELL_PREFER_LOW_LATENCY_MODELS=True,
        UPSELL_LLM_DECISION_CACHE_SECONDS=300,
    )
    def test_background_llm_decision_is_single_flight_then_cached(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[0]["item"]
        response = Mock(status_code=200)
        response.json.return_value = {
            "model": "mistralai/mistral-nemo",
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"%s",'
                    '"reason":null,"reasoning":"Best valid complement.",'
                    '"suggestion_copy":"A refreshing match for your meal.","confidence":0.9}'
                ) % (chosen.id, chosen.item_name, rows[0]["target_role"])}
            }],
        }
        deferred_threads = []

        class DeferredThread:
            def __init__(self, *, target, **kwargs):
                self.target = target
                deferred_threads.append(self)

            def start(self):
                return None

        context = self._agent_context(rows)
        cache_scope = f"background-cache-test-{self.restaurant.id}"
        with patch("order.upsell_knowledge.threading.Thread", DeferredThread), patch(
            "order.upsell_knowledge.requests.post",
            return_value=response,
        ) as post:
            first_decision, first_status = request_upsell_llm_decision(
                context,
                cache_scope=cache_scope,
                background=True,
            )
            second_decision, second_status = request_upsell_llm_decision(
                context,
                cache_scope=cache_scope,
                background=True,
            )
            deferred_threads[0].target()
            cached_decision, cached_status = request_upsell_llm_decision(
                context,
                cache_scope=cache_scope,
                background=True,
            )

        self.assertIsNone(first_decision)
        self.assertIsNone(second_decision)
        self.assertEqual(first_status, "pending")
        self.assertEqual(second_status, "pending")
        self.assertEqual(len(deferred_threads), 1)
        self.assertEqual(post.call_count, 1)
        self.assertEqual(cached_status, "ok")
        self.assertEqual(cached_decision["suggested_item_id"], chosen.id)
        self.assertTrue(cached_decision["_llm_cache_hit"])

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="sk-or-v1-test-key-that-is-long-enough",
    )
    def test_openrouter_timeout_returns_no_recommendation(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        with patch("order.upsell_knowledge.requests.post", side_effect=requests.Timeout):
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertEqual(llm_status, "timeout")
        self.assertTrue(decision["suggest_nothing"])
        self.assertEqual(decision["decision_source"], "llm_unavailable")
        self.assertEqual(decision["llm_status"], "timeout")
        self.assertNotIn("suggested_item_id", decision)

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="openrouter",
        OPENROUTER_API_KEY="",
    )
    def test_missing_openrouter_key_does_not_make_network_request(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        with patch("order.upsell_knowledge.requests.post") as post:
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        self.assertIsNone(raw_decision)
        self.assertEqual(llm_status, "missing_openrouter_key")
        post.assert_not_called()

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="vertex",
        VERTEX_UPSELL_PROJECT_ID="cleverdining-prod",
        VERTEX_UPSELL_LOCATION="us-central1",
        VERTEX_UPSELL_MODEL="openai/gpt-oss-20b-maas",
        VERTEX_UPSELL_SERVICE_ACCOUNT_JSON='{"type":"service_account"}',
        VERTEX_UPSELL_TIMEOUT_SECONDS=1.0,
    )
    def test_vertex_decision_is_structured_and_validated(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        chosen = rows[-1]["item"]
        response = Mock(status_code=200)
        response.json.return_value = {
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":false,"suggested_item_id":%d,'
                    '"suggested_item_name":"%s","target_role":"DRINK_COLD",'
                    '"reason":null,"reasoning":"Best valid match.",'
                    '"suggestion_copy":"A crisp finish for your meal.","confidence":0.91}'
                )
                % (chosen.id, chosen.item_name)}
            }]
        }
        session = Mock()
        session.post.return_value = response

        with patch("order.upsell_knowledge._get_vertex_authorized_session", return_value=session):
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertEqual(llm_status, "ok")
        self.assertEqual(decision["decision_source"], "llm")
        self.assertEqual(decision["suggested_item_id"], chosen.id)
        self.assertEqual(decision["suggestion_copy"], "A crisp finish for your meal.")
        self.assertEqual(
            session.post.call_args.args[0],
            "https://us-central1-aiplatform.googleapis.com/v1/projects/cleverdining-prod/locations/"
            "us-central1/endpoints/openapi/chat/completions",
        )
        request_json = session.post.call_args.kwargs["json"]
        self.assertEqual(request_json["model"], "openai/gpt-oss-20b-maas")
        self.assertEqual(request_json["response_format"], {"type": "json_object"})
        self.assertEqual(request_json["temperature"], 0.2)
        self.assertGreaterEqual(request_json["max_tokens"], 300)
        self.assertLessEqual(request_json["max_tokens"], 350)

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="vertex",
        VERTEX_UPSELL_PROJECT_ID="cleverdining-prod",
        VERTEX_UPSELL_SERVICE_ACCOUNT_JSON='{"type":"service_account"}',
    )
    def test_vertex_timeout_returns_no_recommendation(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        session = Mock()
        session.post.side_effect = requests.Timeout
        with patch("order.upsell_knowledge._get_vertex_authorized_session", return_value=session):
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertEqual(llm_status, "timeout")
        self.assertTrue(decision["suggest_nothing"])
        self.assertEqual(decision["decision_source"], "llm_unavailable")
        self.assertEqual(decision["llm_status"], "timeout")
        self.assertNotIn("suggested_item_id", decision)

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="vertex",
        VERTEX_UPSELL_PROJECT_ID="cleverdining-prod",
        VERTEX_UPSELL_SERVICE_ACCOUNT_JSON='{"type":"service_account"}',
    )
    def test_vertex_can_suggest_nothing(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        response = Mock(status_code=200)
        response.json.return_value = {
            "choices": [{
                "message": {"content": (
                    '{"suggest_nothing":true,"suggested_item_id":null,'
                    '"suggested_item_name":null,"target_role":null,'
                    '"reason":"The order is complete.","reasoning":"Nothing adds value.",'
                    '"suggestion_copy":null,"confidence":0.95}'
                )}
            }]
        }
        session = Mock()
        session.post.return_value = response
        with patch("order.upsell_knowledge._get_vertex_authorized_session", return_value=session):
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        decision = validated_upsell_agent_decision(raw_decision, rows, llm_status=llm_status)
        self.assertTrue(decision["suggest_nothing"])
        self.assertEqual(decision["decision_source"], "llm")

    @override_settings(
        UPSELL_LLM_ENABLED=True,
        UPSELL_LLM_PROVIDER="vertex",
        VERTEX_UPSELL_PROJECT_ID="cleverdining-prod",
        VERTEX_UPSELL_SERVICE_ACCOUNT_JSON="",
    )
    def test_missing_vertex_credentials_does_not_make_network_request(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=4,
        )
        with patch("order.upsell_knowledge._get_vertex_authorized_session") as session:
            raw_decision, llm_status = call_upsell_llm(self._agent_context(rows))

        self.assertIsNone(raw_decision)
        self.assertEqual(llm_status, "missing_vertex_credentials")
        session.assert_not_called()

    def test_smart_suggestions_applies_valid_llm_choice_and_copy(self):
        rows = build_item_context_upsell_suggestions(
            self.restaurant,
            [self.burger.id],
            trigger_point="cart",
            source_item_id=self.burger.id,
            limit=5,
            apply_surface_limit=False,
        )
        chosen = rows[-1]["item"]
        request = APIRequestFactory().get(
            "/api/upsell/smart-suggestions",
            {
                "restaurant_id": self.restaurant.id,
                "cart_item_ids": str(self.burger.id),
                "source_item_id": self.burger.id,
                "trigger_point": "cart",
                "limit": 2,
            },
        )
        llm_response = {
            "suggest_nothing": False,
            "suggested_item_id": chosen.id,
            "suggested_item_name": chosen.item_name,
            "target_role": rows[-1]["target_role"],
            "reason": None,
            "reasoning": "Best valid candidate for this cart.",
            "suggestion_copy": "A lighter finish for your order.",
            "confidence": 0.92,
            "_llm_provider": "vertex_maas",
            "_llm_model": "openai/gpt-oss-20b-maas",
        }

        with patch("order.upsell_views.call_upsell_llm", return_value=(llm_response, "ok")):
            response = UpsellSmartSuggestionsAPIView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], chosen.id)
        self.assertEqual(response.data["results"][0]["suggestion_copy"], "A lighter finish for your order.")
        self.assertEqual(response.data["results"][0]["decision_source"], "llm")
        self.assertTrue(
            all(row["decision_source"] == "llm" for row in response.data["results"])
        )
        self.assertEqual(response.data["knowledge_base"]["llm_status"], "ok")

    def test_smart_suggestions_returns_pending_without_a_deterministic_result(self):
        request = APIRequestFactory().get(
            "/api/upsell/smart-suggestions",
            {
                "restaurant_id": self.restaurant.id,
                "cart_item_ids": str(self.burger.id),
                "source_item_id": self.burger.id,
                "trigger_point": "add_to_cart",
                "async_llm": "1",
            },
        )

        with patch(
            "order.upsell_views.request_upsell_llm_decision",
            return_value=(None, "pending"),
        ) as request_decision:
            response = UpsellSmartSuggestionsAPIView.as_view()(request)

        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.data["pending"])
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])
        self.assertEqual(
            response.data["agent_decision"]["decision_source"],
            "llm_pending",
        )
        request_decision.assert_called_once()
        self.assertTrue(request_decision.call_args.kwargs["background"])

    def test_add_and_passive_cart_remain_available_while_prepayment_is_capped(self):
        session_id = "surface-specific-cap"
        for index in range(4):
            UpsellEvent.objects.create(
                restaurant=self.restaurant,
                session_id=session_id,
                trigger_point="add_to_cart",
                action="shown",
                upsell_item=self.cola,
                upsell_item_name=f"Cola {index}",
            )

        add_request = APIRequestFactory().get(
            "/api/upsell/smart-suggestions",
            {
                "restaurant_id": self.restaurant.id,
                "cart_item_ids": str(self.burger.id),
                "source_item_id": self.burger.id,
                "trigger_point": "add_to_cart",
                "session_id": session_id,
            },
        )
        with patch("order.upsell_views.call_upsell_llm", return_value=(None, "disabled")):
            add_response = UpsellSmartSuggestionsAPIView.as_view()(add_request)

        self.assertEqual(add_response.status_code, 200)
        self.assertEqual(add_response.data["count"], 0)
        self.assertEqual(
            add_response.data["agent_decision"]["decision_source"],
            "llm_unavailable",
        )

        for index in range(4):
            UpsellEvent.objects.create(
                restaurant=self.restaurant,
                session_id=session_id,
                trigger_point="cart",
                action="shown",
                upsell_item=self.cola,
                upsell_item_name=f"Cart Cola {index}",
            )

        cart_request = APIRequestFactory().get(
            "/api/upsell/smart-suggestions",
            {
                "restaurant_id": self.restaurant.id,
                "cart_item_ids": str(self.burger.id),
                "trigger_point": "cart",
                "session_id": session_id,
            },
        )
        with patch("order.upsell_views.call_upsell_llm", return_value=(None, "disabled")):
            cart_response = UpsellSmartSuggestionsAPIView.as_view()(cart_request)

        self.assertEqual(cart_response.status_code, 200)
        self.assertEqual(cart_response.data["count"], 0)
        self.assertEqual(
            cart_response.data["agent_decision"]["decision_source"],
            "llm_unavailable",
        )

        for index in range(4):
            UpsellEvent.objects.create(
                restaurant=self.restaurant,
                session_id=session_id,
                trigger_point="before_payment",
                action="shown",
                upsell_item=self.cola,
                upsell_item_name=f"Prepayment Cola {index}",
            )

        before_payment_request = APIRequestFactory().get(
            "/api/upsell/smart-suggestions",
            {
                "restaurant_id": self.restaurant.id,
                "cart_item_ids": str(self.burger.id),
                "trigger_point": "before_payment",
                "session_id": session_id,
            },
        )
        before_payment_response = UpsellSmartSuggestionsAPIView.as_view()(before_payment_request)

        self.assertEqual(before_payment_response.status_code, 200)
        self.assertEqual(before_payment_response.data["count"], 0)
        self.assertEqual(
            before_payment_response.data["agent_decision"]["decision_source"],
            "backend_session_cap",
        )
