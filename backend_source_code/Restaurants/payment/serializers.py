from django.utils import timezone
from rest_framework import serializers
from .models import StripeDetails, PaymentGateway, Payment
from .provider_registry import get_provider_metadata, provider_metadata_payload

class PaymentSerializer(serializers.ModelSerializer):
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    table_name = serializers.CharField(source='device.table_name', read_only=True)
    bill_id = serializers.IntegerField(source='bill.id', read_only=True)
    bill_total_amount = serializers.DecimalField(source='bill.total_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_paid_amount = serializers.DecimalField(source='bill.paid_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_remaining_amount = serializers.DecimalField(source='bill.remaining_amount', max_digits=12, decimal_places=2, read_only=True)
    bill_payment_status = serializers.CharField(source='bill.payment_status', read_only=True)
    allocations = serializers.SerializerMethodField()

    def get_allocations(self, obj):
        payload = []
        for alloc in obj.allocations.select_related("bill_item").all().order_by("id"):
            payload.append({
                "id": alloc.id,
                "allocation_type": alloc.allocation_type,
                "participant_id": alloc.participant_id,
                "participant_status": alloc.participant_status,
                "allocated_amount": str(alloc.allocated_amount),
                "allocated_quantity": str(alloc.allocated_quantity),
                "bill_item_id": alloc.bill_item_id,
                "bill_item_name": alloc.bill_item.item_name if alloc.bill_item else None,
            })
        return payload
    
    class Meta:
        model = Payment
        fields = [
            'id', 'order', 'device', 'amount', 'provider', 'status', 'transaction_id',
            'split_type', 'payer_id_or_name', 'bill_id', 'bill_total_amount', 'bill_paid_amount',
            'bill_remaining_amount', 'bill_payment_status', 'allocations',
            'created_at', 'order_id', 'table_name'
        ]

class StripeDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StripeDetails
        fields = ['id', 'stripe_secret_key', 'stripe_publishable_key']
        extra_kwargs = {
            'stripe_secret_key': {'write_only': True},
            'stripe_publishable_key': {'write_only': True}
        }

class PaymentGatewaySerializer(serializers.ModelSerializer):
    credentials = serializers.JSONField(write_only=True, required=False)
    credentialsMasked = serializers.SerializerMethodField()
    credentialsConfigured = serializers.SerializerMethodField()
    providerName = serializers.SerializerMethodField()
    logoUrl = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    documentationUrl = serializers.SerializerMethodField()
    supportedCountries = serializers.SerializerMethodField()
    supportedCurrencies = serializers.SerializerMethodField()
    supportedPaymentMethods = serializers.SerializerMethodField()
    providerStatusLabel = serializers.SerializerMethodField()
    credentialFields = serializers.SerializerMethodField()
    connectionStatus = serializers.CharField(source='connection_status', read_only=True)
    webhookStatus = serializers.CharField(source='webhook_status', read_only=True)
    sandboxMode = serializers.BooleanField(source='sandbox_mode', required=False)
    isEnabled = serializers.BooleanField(source='is_enabled', required=False)
    lastValidationAt = serializers.DateTimeField(source='last_validation_at', read_only=True)
    lastHealthCheckAt = serializers.DateTimeField(source='last_health_check_at', read_only=True)
    lastError = serializers.CharField(source='last_error', read_only=True)

    def _metadata(self, obj):
        try:
            return provider_metadata_payload(obj.provider)
        except Exception:
            return {
                "name": obj.get_provider_display(),
                "logoUrl": "",
                "description": "",
                "documentationUrl": "",
                "supportedCountries": [],
                "supportedCurrencies": [],
                "supportedPaymentMethods": [],
                "statusLabel": "",
                "credentialFields": [],
            }

    def get_credentialsMasked(self, obj):
        return obj.masked_credentials()

    def get_credentialsConfigured(self, obj):
        return obj.has_credentials()

    def get_providerName(self, obj):
        return self._metadata(obj)["name"]

    def get_logoUrl(self, obj):
        return self._metadata(obj)["logoUrl"]

    def get_description(self, obj):
        return self._metadata(obj)["description"]

    def get_documentationUrl(self, obj):
        return self._metadata(obj)["documentationUrl"]

    def get_supportedCountries(self, obj):
        return self._metadata(obj)["supportedCountries"]

    def get_supportedCurrencies(self, obj):
        return self._metadata(obj)["supportedCurrencies"]

    def get_supportedPaymentMethods(self, obj):
        return self._metadata(obj)["supportedPaymentMethods"]

    def get_providerStatusLabel(self, obj):
        return self._metadata(obj)["statusLabel"]

    def get_credentialFields(self, obj):
        return self._metadata(obj)["credentialFields"]

    def validate_provider(self, value):
        # PayTabs remains a legacy gateway even though it is not in the new registry.
        if value != "paytabs":
            get_provider_metadata(value)
        return value

    def _extract_credentials(self, validated_data):
        credentials = validated_data.pop('credentials', None)
        key_secret = validated_data.get('key_secret')
        key_id = validated_data.get('key_id')
        if key_secret or key_id:
            credentials = dict(credentials or {})
            provider = validated_data.get('provider') or getattr(self.instance, 'provider', '')
            alias_map = {
                "stripe": ("publishable_key", "secret_key"),
                "checkout": ("public_key", "secret_key"),
                "paytabs": ("profile_id", "server_key"),
                "payme": ("merchant_id", "api_key"),
                "adyen": ("merchant_account", "api_key"),
                "worldpay": ("merchant_code", "service_key"),
                "sumup": ("merchant_code", "api_key"),
                "square": ("application_id", "access_token"),
            }
            public_key, secret_key = alias_map.get(provider, ("key_id", "key_secret"))
            if key_id:
                credentials.setdefault(public_key, key_id)
            if key_secret:
                credentials.setdefault(secret_key, key_secret)
        return credentials

    def create(self, validated_data):
        credentials = self._extract_credentials(validated_data)
        instance = PaymentGateway(**validated_data)
        if credentials:
            instance.set_credentials(credentials)
            instance.connection_status = 'connected'
            instance.last_validation_at = timezone.now()
            instance.last_error = ''
        instance.save()
        return instance

    def update(self, instance, validated_data):
        credentials = self._extract_credentials(validated_data)
        # Empty secret fields mean "keep existing secret"; never overwrite with blank.
        if validated_data.get('key_secret', None) == "":
            validated_data.pop('key_secret', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if credentials:
            instance.set_credentials(credentials)
            instance.connection_status = 'connected'
            instance.last_validation_at = timezone.now()
            instance.last_error = ''
        instance.save()
        return instance

    class Meta:
        model = PaymentGateway
        fields = [
            'id', 'provider', 'providerName', 'logoUrl', 'description', 'documentationUrl',
            'supportedCountries', 'supportedCurrencies', 'supportedPaymentMethods',
            'providerStatusLabel', 'credentialFields', 'credentialsMasked', 'credentialsConfigured',
            'is_active', 'isEnabled', 'sandboxMode', 'connectionStatus', 'webhookStatus',
            'lastValidationAt', 'lastHealthCheckAt', 'lastError',
            'key_id', 'key_secret', 'credentials',
            'apple_pay_enabled', 'apple_merchant_id', 'apple_domain_verified',
            'google_pay_enabled', 'google_merchant_id', 'google_environment',
            'created_at'
        ]
        extra_kwargs = {
            'key_secret': {'write_only': True},
        }
        read_only_fields = ['id', 'restaurant', 'apple_domain_verified']
