/* eslint-disable @typescript-eslint/no-explicit-any */
import axiosInstance from "@/lib/axios";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

type Props = {
    open: boolean;
    onClose: () => void;
    provider: "stripe" | "checkout" | "paytabs" | "payme";
    onSuccess?: (data: any) => void;
};

type FormShape = {
    key_id: string;
    key_secret: string;
    is_active: boolean;
    // Apple Pay
    apple_pay_enabled: boolean;
    apple_merchant_id: string;
    // Google Pay
    google_pay_enabled: boolean;
    google_merchant_id: string;
    google_environment: "TEST" | "PRODUCTION";
};

export default function PaymentGatewayModal({
    open,
    onClose,
    provider,
    onSuccess,
}: Props) {
    const [loading, setLoading] = useState(false);
    const [isUpdate, setIsUpdate] = useState(false);
    const [serverMsg, setServerMsg] = useState<string | null>(null);
    const [recordId, setRecordId] = useState<string | null>(null);
    const [appleDomainVerified, setAppleDomainVerified] = useState(false);

    const { register, handleSubmit, reset, setValue, watch } = useForm<FormShape>({
        defaultValues: {
            key_id: "",
            key_secret: "",
            is_active: true,
            apple_pay_enabled: false,
            apple_merchant_id: "",
            google_pay_enabled: false,
            google_merchant_id: "",
            google_environment: "TEST",
        },
    });

    const applePayEnabled = watch("apple_pay_enabled");
    const googlePayEnabled = watch("google_pay_enabled");

    const getProviderName = (p: string) => {
        switch (p) {
            case "stripe":
                return "Stripe";
            case "checkout":
                return "Checkout.com";
            case "paytabs":
                return "PayTabs";
            case "payme":
                return "Payme";
            default:
                return p;
        }
    };

    const getKeyIdLabel = (p: string) => {
        switch (p) {
            case "stripe":
                return "Publishable Key";
            case "checkout":
                return "Public Key";
            case "paytabs":
                return "Profile ID";
            case "payme":
                return "Merchant ID";
            default:
                return "Key ID";
        }
    };

    const getKeySecretLabel = (p: string) => {
        switch (p) {
            case "stripe":
                return "Secret Key";
            case "checkout":
                return "Secret Key";
            case "paytabs":
                return "Server Key";
            case "payme":
                return "API Key";
            default:
                return "Key Secret";
        }
    };

    useEffect(() => {
        if (!open) return;

        const fetchGatewayData = async () => {
            try {
                // Filter by provider on client side since backend returns all
                const { data } = await cachedGet("/owners/payment-gateways/", {}, { ttlMs: 30_000 });
                const gateways = Array.isArray(data) ? data : data.results;
                const rec = gateways.find((g: any) => g.provider === provider);

                if (rec) {
                    setIsUpdate(true);
                    setRecordId(rec.id);
                    setValue("key_id", rec.key_id);
                    setValue("key_secret", rec.key_secret); // Note: This might be encrypted/masked
                    setValue("is_active", rec.is_active);
                    // Wallet fields
                    setValue("apple_pay_enabled", rec.apple_pay_enabled || false);
                    setValue("apple_merchant_id", rec.apple_merchant_id || "");
                    setAppleDomainVerified(rec.apple_domain_verified || false);
                    setValue("google_pay_enabled", rec.google_pay_enabled || false);
                    setValue("google_merchant_id", rec.google_merchant_id || "");
                    setValue("google_environment", rec.google_environment || "TEST");
                } else {
                    setIsUpdate(false);
                    setRecordId(null);
                    setAppleDomainVerified(false);
                    reset({
                        key_id: "", key_secret: "", is_active: true,
                        apple_pay_enabled: false, apple_merchant_id: "",
                        google_pay_enabled: false, google_merchant_id: "", google_environment: "TEST"
                    });
                }
            } catch (err: any) {
                console.error("Error fetching gateway details", err);
            }
        };

        fetchGatewayData();
    }, [open, provider, reset, setValue]);

    if (!open) return null;

    const onSubmit = async (form: FormShape) => {
        setLoading(true);
        setServerMsg(null);

        try {
            const payload = {
                provider,
                key_id: form.key_id.trim(),
                key_secret: form.key_secret.trim(),
                is_active: form.is_active,
                // Wallet configuration
                apple_pay_enabled: form.apple_pay_enabled,
                apple_merchant_id: form.apple_merchant_id?.trim() || null,
                google_pay_enabled: form.google_pay_enabled,
                google_merchant_id: form.google_merchant_id?.trim() || null,
                google_environment: form.google_environment,
            };

            let resp;
            if (recordId) {
                resp = await axiosInstance.patch(
                    `/owners/payment-gateways/${recordId}/`,
                    payload
                );
                if (resp.status === 200) {
                    toast.success(`${getProviderName(provider)} updated successfully`);
                }
            } else {
                resp = await axiosInstance.post(`/owners/payment-gateways/`, payload);
                if (resp.status === 201) {
                    toast.success(`${getProviderName(provider)} added successfully`);
                }
            }

            invalidateApiCache("owners/payment-gateways");
            onSuccess?.(resp.data);
            onClose();
        } catch (err: any) {
            setServerMsg(
                err?.response?.data?.detail ||
                err?.response?.data?.non_field_errors?.[0] ||
                "Failed to save gateway"
            );
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div aria-modal="true" role="dialog" className="fixed inset-0 z-[100]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 cursor-pointer"
                onClick={() => !loading && onClose()}
            />

            {/* Modal Panel */}
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                        {isUpdate
                            ? `Update ${getProviderName(provider)}`
                            : `Add ${getProviderName(provider)}`}
                    </h3>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-700 mb-1">
                                {getKeyIdLabel(provider)}
                            </label>
                            <input
                                type="text"
                                placeholder="..."
                                {...register("key_id", { required: true })}
                                disabled={loading}
                                className="w-full rounded-lg bg-white text-slate-900 px-3 py-2.5 outline-none border border-slate-200 focus:border-[#0055FE]"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-slate-700 mb-1">
                                {getKeySecretLabel(provider)}
                            </label>
                            <input
                                type="text"
                                placeholder="..."
                                {...register("key_secret", { required: true })}
                                disabled={loading}
                                className="w-full rounded-lg bg-white text-slate-900 px-3 py-2.5 outline-none border border-slate-200 focus:border-[#0055FE]"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                {...register("is_active")}
                                disabled={loading}
                                className="rounded border-slate-200 text-[#0055FE] focus:ring-[#0055FE]"
                            />
                            <label htmlFor="is_active" className="text-sm text-slate-700">
                                Set as Active Gateway
                            </label>
                        </div>

                        {/* APPLE PAY SECTION */}
                        {/* 
                        <div className="border-t border-slate-200 pt-4 mt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                    <span className="text-lg"></span> Apple Pay
                                </h4>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="apple_pay_enabled"
                                        {...register("apple_pay_enabled")}
                                        disabled={loading}
                                        className="rounded border-slate-200 text-[#0055FE] focus:ring-[#0055FE]"
                                    />
                                    <label htmlFor="apple_pay_enabled" className="text-sm text-slate-600">
                                        Enable
                                    </label>
                                </div>
                            </div>

                            {applePayEnabled && (
                                <div className="space-y-3 ml-0">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">
                                            Apple Merchant ID
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="merchant.com.yourcompany"
                                            {...register("apple_merchant_id")}
                                            disabled={loading}
                                            className="w-full rounded-lg bg-slate-50 text-slate-900 px-3 py-2 outline-none border border-slate-200 focus:border-[#0055FE] text-sm"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${appleDomainVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {appleDomainVerified ? '✓ Domain Verified' : '⏳ Domain Not Verified'}
                                        </span>
                                        {!appleDomainVerified && (
                                            <span className="text-xs text-slate-400">
                                                Requires hosting verification file
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                         */}

                        {/* GOOGLE PAY SECTION */}
                        {/* 
                        <div className="border-t border-slate-200 pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                    <span className="text-lg text-blue-500">G</span> Google Pay
                                </h4>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="google_pay_enabled"
                                        {...register("google_pay_enabled")}
                                        disabled={loading}
                                        className="rounded border-slate-200 text-[#0055FE] focus:ring-[#0055FE]"
                                    />
                                    <label htmlFor="google_pay_enabled" className="text-sm text-slate-600">
                                        Enable
                                    </label>
                                </div>
                            </div>

                            {googlePayEnabled && (
                                <div className="space-y-3 ml-0">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">
                                            Google Merchant ID
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="BCR2DN4TXXXX"
                                            {...register("google_merchant_id")}
                                            disabled={loading}
                                            className="w-full rounded-lg bg-slate-50 text-slate-900 px-3 py-2 outline-none border border-slate-200 focus:border-[#0055FE] text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">
                                            Environment
                                        </label>
                                        <select
                                            {...register("google_environment")}
                                            disabled={loading}
                                            className="w-full rounded-lg bg-slate-50 text-slate-900 px-3 py-2 outline-none border border-slate-200 focus:border-[#0055FE] text-sm"
                                        >
                                            <option value="TEST">Test (Sandbox)</option>
                                            <option value="PRODUCTION">Production</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                         */}

                        {serverMsg && <p className="text-sm text-red-400">{serverMsg}</p>}

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => !loading && onClose()}
                                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 rounded-lg bg-[#0055FE] hover:bg-[#0047D1] text-white shadow-lg shadow-[#0055FE]/20 hover:shadow-xl"
                            >
                                {loading ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
