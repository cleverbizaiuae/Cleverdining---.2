/* eslint-disable @typescript-eslint/no-explicit-any */
import axiosInstance from "@/lib/axios";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

export type GatewayProvider =
  | "stripe"
  | "checkout"
  | "paytabs"
  | "payme"
  | "adyen"
  | "worldpay"
  | "sumup"
  | "square";

type CredentialField = {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
};

type GatewayRecord = {
  id?: string | number;
  provider: GatewayProvider;
  providerName?: string;
  logoUrl?: string;
  description?: string;
  credentialFields?: CredentialField[];
  credentialsMasked?: Record<string, { configured: boolean; value: string }>;
  credentialsConfigured?: boolean;
  is_active?: boolean;
  isActive?: boolean;
  isEnabled?: boolean;
  sandboxMode?: boolean;
  connectionStatus?: string;
  lastValidationAt?: string | null;
  lastError?: string;
  key_id?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  provider: GatewayProvider;
  onSuccess?: (data: any) => void;
};

const LEGACY_FIELDS: Record<string, CredentialField[]> = {
  stripe: [
    { key: "publishable_key", label: "Publishable Key", secret: false, required: true, placeholder: "pk_live_..." },
    { key: "secret_key", label: "Secret Key", secret: true, required: true, placeholder: "sk_live_..." },
    { key: "webhook_secret", label: "Webhook Secret", secret: true, required: false, placeholder: "whsec_..." },
  ],
  checkout: [
    { key: "public_key", label: "Public Key", secret: false, required: true },
    { key: "secret_key", label: "Secret Key", secret: true, required: true },
    { key: "webhook_secret", label: "Webhook Secret", secret: true, required: false },
  ],
  paytabs: [
    { key: "profile_id", label: "Profile ID", secret: false, required: true },
    { key: "server_key", label: "Server Key", secret: true, required: true },
  ],
  payme: [
    { key: "merchant_id", label: "Merchant ID", secret: false, required: true },
    { key: "api_key", label: "API Key", secret: true, required: true },
    { key: "secret", label: "Secret", secret: true, required: false },
    { key: "webhook_url", label: "Webhook URL", secret: false, required: false },
  ],
  adyen: [
    { key: "merchant_account", label: "Merchant Account", secret: false, required: true },
    { key: "api_key", label: "API Key", secret: true, required: true },
    { key: "client_key", label: "Client Key", secret: false, required: true },
    { key: "hmac_key", label: "HMAC Key", secret: true, required: false },
    { key: "webhook_username", label: "Webhook Username", secret: true, required: false },
    { key: "webhook_password", label: "Webhook Password", secret: true, required: false },
  ],
  worldpay: [
    { key: "merchant_code", label: "Merchant Code", secret: false, required: true },
    { key: "service_key", label: "Service Key", secret: true, required: true },
    { key: "username", label: "Username", secret: false, required: true },
    { key: "password", label: "Password", secret: true, required: true },
    { key: "webhook_secret", label: "Webhook Secret", secret: true, required: false },
  ],
  sumup: [
    { key: "api_key", label: "API Key", secret: true, required: true },
    { key: "merchant_code", label: "Merchant Code", secret: false, required: true },
    { key: "client_id", label: "OAuth Client ID", secret: false, required: false },
    { key: "client_secret", label: "OAuth Client Secret", secret: true, required: false },
  ],
  square: [
    { key: "access_token", label: "Access Token", secret: true, required: true },
    { key: "application_id", label: "Application ID", secret: false, required: true },
    { key: "location_id", label: "Location ID", secret: false, required: true },
    { key: "webhook_signature_key", label: "Webhook Signature Key", secret: true, required: false },
  ],
};

const PROVIDER_NAMES: Record<string, string> = {
  stripe: "Stripe",
  checkout: "Checkout.com",
  paytabs: "PayTabs",
  payme: "PayMe",
  adyen: "Adyen",
  worldpay: "Worldpay",
  sumup: "SumUp",
  square: "Square",
};

export default function PaymentGatewayModal({ open, onClose, provider, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [record, setRecord] = useState<GatewayRecord | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);
  const [sandboxMode, setSandboxMode] = useState(true);

  const providerName = record?.providerName || PROVIDER_NAMES[provider] || provider;
  const fields = useMemo(
    () => (record?.credentialFields?.length ? record.credentialFields : LEGACY_FIELDS[provider] || []),
    [provider, record?.credentialFields]
  );

  useEffect(() => {
    if (!open) return;
    setServerMsg(null);
    setCredentials({});
    setRecord(null);

    const load = async () => {
      try {
        const { data } = await cachedGet("/api/payment-providers/enabled/", {}, { ttlMs: 10_000 });
        const list = Array.isArray(data) ? data : data?.results || [];
        const found = list.find((item: GatewayRecord) => item.provider === provider || (item as any).code === provider);
        setRecord(found || { provider, providerName: PROVIDER_NAMES[provider], credentialFields: LEGACY_FIELDS[provider] });
        setIsActive(Boolean(found?.is_active ?? found?.isActive ?? true));
        setSandboxMode(Boolean(found?.sandboxMode ?? true));

        const nextCredentials: Record<string, string> = {};
        const masked = found?.credentialsMasked || {};
        (found?.credentialFields || LEGACY_FIELDS[provider] || []).forEach((field: CredentialField) => {
          const maskedValue = masked[field.key]?.value;
          if (!field.secret && maskedValue && maskedValue !== "••••••••") {
            nextCredentials[field.key] = maskedValue;
          } else {
            nextCredentials[field.key] = "";
          }
        });
        setCredentials(nextCredentials);
      } catch (err) {
        console.warn("Failed to load payment provider metadata", err);
        setRecord({ provider, providerName: PROVIDER_NAMES[provider], credentialFields: LEGACY_FIELDS[provider] });
      }
    };

    load();
  }, [open, provider]);

  if (!open) return null;

  const setCredential = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const activeSecretsConfigured = (field: CredentialField) => Boolean(record?.credentialsMasked?.[field.key]?.configured);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setServerMsg(null);

    try {
      const credentialPayload: Record<string, string> = {};
      fields.forEach((field) => {
        const value = credentials[field.key]?.trim();
        if (value) credentialPayload[field.key] = value;
      });

      const missing = fields.filter(
        (field) => field.required && !credentialPayload[field.key] && !activeSecretsConfigured(field)
      );
      if (missing.length) {
        setServerMsg(`Missing required credentials: ${missing.map((field) => field.label).join(", ")}`);
        return;
      }

      const resp = await axiosInstance.post(`/api/payment-providers/${provider}/connect/`, {
        credentials: credentialPayload,
        is_active: isActive,
        sandboxMode,
        isEnabled: true,
      });

      toast.success(`${providerName} saved successfully`);
      invalidateApiCache("api/payment-providers");
      invalidateApiCache("owners/payment-gateways");
      onSuccess?.(resp.data);
      onClose();
    } catch (err: any) {
      setServerMsg(
        err?.response?.data?.error ||
          err?.response?.data?.detail ||
          err?.response?.data?.non_field_errors?.[0] ||
          "Failed to save gateway"
      );
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setServerMsg(null);
    try {
      await axiosInstance.post(`/api/payment-providers/${provider}/test/`);
      toast.success(`${providerName} connection verified`);
      invalidateApiCache("api/payment-providers");
    } catch (err: any) {
      setServerMsg(err?.response?.data?.error || "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div aria-modal="true" role="dialog" className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50 cursor-pointer" onClick={() => !loading && onClose()} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
          <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Configure {providerName}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Secrets are encrypted before storage and never shown again after saving.
              </p>
            </div>
            <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-700 text-xl leading-none">
              ×
            </button>
          </div>

          <form onSubmit={onSubmit} className="p-5 space-y-4">
            {record?.description && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3">{record.description}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((field) => (
                <div key={field.key} className={field.secret ? "sm:col-span-2" : undefined}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {field.label} {field.required ? <span className="text-red-500">*</span> : null}
                  </label>
                  <input
                    type={field.secret ? "password" : "text"}
                    value={credentials[field.key] || ""}
                    onChange={(event) => setCredential(field.key, event.target.value)}
                    placeholder={field.secret && activeSecretsConfigured(field) ? "Existing secret stored. Leave blank to keep it." : field.placeholder || "..."}
                    disabled={loading}
                    className="w-full rounded-lg bg-white text-slate-900 px-3 py-2.5 outline-none border border-slate-200 focus:border-[#0055FE] text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-slate-200 text-[#0055FE]" />
                Set as active provider
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={sandboxMode} onChange={(e) => setSandboxMode(e.target.checked)} className="rounded border-slate-200 text-[#0055FE]" />
                Sandbox mode
              </label>
            </div>

            {record?.connectionStatus && (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600">
                Status: <span className="font-semibold text-slate-900">{record.connectionStatus}</span>
                {record.lastValidationAt ? <span> · Last validation: {new Date(record.lastValidationAt).toLocaleString()}</span> : null}
              </div>
            )}

            {serverMsg && <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">{serverMsg}</div>}

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-2">
              {record?.credentialsConfigured && (
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={loading || testing}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                >
                  {testing ? "Testing..." : "Test Connection"}
                </button>
              )}
              <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-[#0055FE] text-white text-sm font-medium hover:bg-[#0047D1] disabled:opacity-60">
                {loading ? "Saving..." : "Save Provider"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
