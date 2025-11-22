/* eslint-disable @typescript-eslint/no-explicit-any */
import axiosInstance from "@/lib/axios";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (data: any) => void;
};

type FormShape = {
  stripe_secret_key: string;
  stripe_publishable_key: string;
};

export default function StripeConnectModal({
  open,
  onClose,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [secretkey, setSecretkey] = useState("");
  const [publisher, setPublisher] = useState("");
  const { register, handleSubmit, reset } = useForm<FormShape>({
    defaultValues: {
      stripe_secret_key: "",
      stripe_publishable_key: "",
    },
  });

  // Fetch to check if record exists, but don't prefill keys
  useEffect(() => {
    if (!open) return;

    const fetchStripeData = async () => {
      try {
        const { data } = await axiosInstance.get("/owners/stripe/");
        const rec = data?.id ? data : data?.results?.[0];
        console.log(rec.stripe_secret_key);
        if (rec) {
          setIsUpdate(true);
          setRecordId(rec?.id ?? null);
          setSecretkey(rec?.stripe_secret_key ?? "");
          setPublisher(rec?.stripe_publishable_key ?? "");
          reset({ stripe_secret_key: "", stripe_publishable_key: "" });
        } else {
          setIsUpdate(false);
          setRecordId(null);
          reset({ stripe_secret_key: "", stripe_publishable_key: "" });
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setIsUpdate(false);
          setRecordId(null);
          reset({ stripe_secret_key: "", stripe_publishable_key: "" });
        } else {
          console.error("Error fetching Stripe details", err);
        }
      }
    };

    fetchStripeData();
  }, [open, reset]);

  if (!open) return null;

  const onSubmit = async (form: FormShape) => {
    setLoading(true);
    setServerMsg(null);

    try {
      const payload = {
        stripe_secret_key: form.stripe_secret_key.trim(),
        stripe_publishable_key: form.stripe_publishable_key.trim(),
      };

      let resp;
      if (recordId) {
        console.log(payload);
        resp = await axiosInstance.patch(
          `/owners/stripe/${recordId}/`,
          payload
        );
        if (resp.status === 200) {
          toast.success("Stripe keys updated successfully");
        }
      } else {
        resp = await axiosInstance.post(`/owners/stripe/`, payload);
        if(resp.status === 201) {
          toast.success("Stripe added successfully");
        }
      }

      onSuccess?.(resp.data);
      onClose();
    } catch (err: any) {
      setServerMsg(err?.response?.data?.detail || "Failed to save Stripe keys");
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
            {isUpdate ? "Update Stripe Keys" : "Add Stripe Keys"}
          </h3>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Stripe Secret Key
              </label>
              <input
                type="text" // visible when typing
                placeholder="sk_test_..."
                // value={secretkey}
                {...register("stripe_secret_key")}
                disabled={loading}
                className="w-full rounded-lg bg-[#201C3F] text-white px-3 py-2.5 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Stripe Publishable Key
              </label>
              <input
                type="text"
                placeholder="pk_test_..."
                // value={publisher||""}
                {...register("stripe_publishable_key")}
                disabled={loading}
                className="w-full rounded-lg bg-[#201C3F] text-white px-3 py-2.5 outline-none"
              />
            </div>

            {serverMsg && <p className="text-sm text-red-400">{serverMsg}</p>}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => !loading && onClose()}
                className="px-4 py-2 border border-white/20 rounded-lg text-white"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white"
              >
                {loading ? "Saving..." : isUpdate ? "Update Keys" : "Add Keys"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
