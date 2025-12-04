/* eslint-disable @typescript-eslint/no-explicit-any */
import axiosInstance from "@/lib/axios";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

type Props = {
    open: boolean;
    onClose: () => void;
    provider: "stripe" | "razorpay" | "checkout" | "paytabs";
    onSuccess?: (data: any) => void;
};

type FormShape = {
    key_id: string;
    key_secret: string;
    is_active: boolean;
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

    const { register, handleSubmit, reset, setValue } = useForm<FormShape>({
        defaultValues: {
            key_id: "",
            key_secret: "",
            is_active: true,
        },
    });

    const getProviderName = (p: string) => {
        switch (p) {
            case "stripe":
                return "Stripe";
            case "razorpay":
                return "Razorpay";
            case "checkout":
                return "Checkout.com";
            case "paytabs":
                return "PayTabs";
            default:
                return p;
        }
    };

    const getKeyIdLabel = (p: string) => {
        switch (p) {
            case "stripe":
                return "Publishable Key";
            case "razorpay":
                return "Key ID";
            case "checkout":
                return "Public Key";
            case "paytabs":
                return "Profile ID";
            default:
                return "Key ID";
        }
    };

    const getKeySecretLabel = (p: string) => {
        switch (p) {
            case "stripe":
                return "Secret Key";
            case "razorpay":
                return "Key Secret";
            case "checkout":
                return "Secret Key";
            case "paytabs":
                return "Server Key";
            default:
                return "Key Secret";
        }
    };

    useEffect(() => {
        if (!open) return;

        const fetchGatewayData = async () => {
            try {
                // Filter by provider on client side since backend returns all
                const { data } = await axiosInstance.get("/owners/payment-gateways/");
                const gateways = Array.isArray(data) ? data : data.results;
                const rec = gateways.find((g: any) => g.provider === provider);

                if (rec) {
                    setIsUpdate(true);
                    setRecordId(rec.id);
                    setValue("key_id", rec.key_id);
                    setValue("key_secret", rec.key_secret); // Note: This might be encrypted/masked
                    setValue("is_active", rec.is_active);
                } else {
                    setIsUpdate(false);
                    setRecordId(null);
                    reset({ key_id: "", key_secret: "", is_active: true });
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
                <div className="w-full max-w-md rounded-2xl bg-sidebar/90 backdrop-blur-xl p-6 shadow-2xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4">
                        {isUpdate
                            ? `Update ${getProviderName(provider)}`
                            : `Add ${getProviderName(provider)}`}
                    </h3>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                {getKeyIdLabel(provider)}
                            </label>
                            <input
                                type="text"
                                placeholder="..."
                                {...register("key_id", { required: true })}
                                disabled={loading}
                                className="w-full rounded-lg bg-[#201C3F] text-white px-3 py-2.5 outline-none border border-white/10 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-300 mb-1">
                                {getKeySecretLabel(provider)}
                            </label>
                            <input
                                type="text"
                                placeholder="..."
                                {...register("key_secret", { required: true })}
                                disabled={loading}
                                className="w-full rounded-lg bg-[#201C3F] text-white px-3 py-2.5 outline-none border border-white/10 focus:border-indigo-500"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                {...register("is_active")}
                                disabled={loading}
                                className="rounded bg-[#201C3F] border-white/10 text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor="is_active" className="text-sm text-gray-300">
                                Set as Active Gateway
                            </label>
                        </div>

                        {serverMsg && <p className="text-sm text-red-400">{serverMsg}</p>}

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => !loading && onClose()}
                                className="px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white shadow-lg shadow-indigo-600/20 hover:shadow-xl hover:brightness-110"
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
