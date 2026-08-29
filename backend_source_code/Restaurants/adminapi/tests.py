from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from .models import Integration


class IntegrationDeletionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.detected = {
            "provider_key": "messaging:test-provider",
            "name": "Test Provider",
            "category": Integration.Category.MESSAGING,
            "logo_url": "",
            "notes": "Detected test integration.",
            "connection_status": Integration.ConnectionStatus.CONNECTED,
            "api_health": Integration.ApiHealth.HEALTHY,
            "environment": "test",
            "documentation_url": "",
        }

    @patch("adminapi.integration_detection.detect_integrations")
    def test_deleted_detected_integration_stays_removed_after_refresh(self, detect_integrations):
        detect_integrations.return_value = [self.detected]

        initial = self.client.get("/api/integrations")
        self.assertEqual(initial.status_code, 200)
        integration_id = initial.json()[0]["id"]

        removed = self.client.delete(f"/api/integrations/{integration_id}")
        self.assertEqual(removed.status_code, 204)
        self.assertTrue(Integration.objects.get(pk=integration_id).is_deleted)

        refreshed = self.client.get("/api/integrations")
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(refreshed.json(), [])
        self.assertEqual(Integration.objects.count(), 1)
