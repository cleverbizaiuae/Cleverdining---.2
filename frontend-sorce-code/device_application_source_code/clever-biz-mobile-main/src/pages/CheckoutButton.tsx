import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../lib/axios";
import { loadStripe } from "@stripe/stripe-js";
import toast from "react-hot-toast";

export default function CheckoutButton({
  orderId,
  disabled,
  provider, // Optional provider override
  tipAmount,
  tipType,
  tipValue,
  isBulkCheckout,
}: {
  orderId?: number | string; // Make optional for bulk
  disabled?: boolean;
  provider?: string;
  tipAmount?: number;
  tipType?: string | null;
  tipValue?: number | string;
  isBulkCheckout?: boolean;
}) {
  console.log(orderId);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PK!);

  const handleCheckout = async () => {
    if (loading) return; // Prevent double clicks

    // For Cash, we might want a confirmation dialog here if not handled by parent?
    // Parent handles confirmation modal as per plan.

    try {
      setLoading(true);

      const guestToken = localStorage.getItem("guest_session_token");
      if (!guestToken) {
        toast.error("Session expired. Please log in again.");
        return;
      }

      console.log("Using Token:", guestToken.slice(0, 10) + "...");

      let res;

      if (isBulkCheckout) {
        // BULK CHECKOUT FLOW
        res = await axiosInstance.post(
          `/api/customer/create-bulk-checkout-session/`,
          {
            provider,
            tip_amount: tipAmount,
            tip_type: tipType,
            tip_value: tipValue
          },
          {
            headers: {
              "X-Guest-Session-Token": guestToken
            }
          }
        );
      } else {
        // SINGLE ORDER FLOW
        if (!orderId) throw new Error("Order ID missing for single checkout");
        res = await axiosInstance.post(
          `/api/customer/create-checkout-session/${orderId}/?guest_token=${guestToken}`,
          {
            provider,
            tip_amount: tipAmount,
            tip_type: tipType,
            tip_value: tipValue
          },
          {
            headers: {
              "X-Guest-Session-Token": guestToken
            }
          }
        );
      }

      const url: string | undefined = res?.data?.url;
      const sessionId: string | undefined = res?.data?.sessionId; // Stripe session ID
      const transactionId: string | undefined = res?.data?.transaction_id; // Unified ID

      const effectiveSessionId = sessionId || transactionId;

      if (!effectiveSessionId && !url)
        throw new Error("No checkout URL or sessionId returned");

      // If URL is provided (Cash or Stripe), follow it
      if (url) {
        // For cash payments, redirect to success page directly
        if (provider === 'cash') {
          toast.success("Cash payment requested! Staff will come to your table.", { duration: 5000, icon: '💵' });
          navigate('/dashboard/orders');
          return;
        }
        window.location.href = url;
        return;
      }

      // Fallback for Stripe dedicated flow if no URL returned (legacy)
      if (sessionId) {
        const stripe = await stripePromise;
        if (!stripe) throw new Error("Stripe not loaded");
        const { error } = await stripe.redirectToCheckout({
          sessionId: sessionId!,
        });
        if (error) throw error;
      }

    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.error || e?.message || "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleCheckout}
        disabled={disabled || loading}
        className={`w-full px-4 py-3 rounded-lg font-bold text-lg shadow-md transition-all duration-300 transform active:scale-95
    ${disabled || loading
            ? "bg-gray-400 cursor-not-allowed"
            : provider === 'cash'
              ? "bg-yellow-500 hover:bg-yellow-600 text-black border border-yellow-600"
              : "bg-green-600 hover:bg-green-700 text-white"
          }
  `}
      >
        {loading ? "Processing..." : provider === 'cash' ? "Confirm Pay by Cash" : "Pay Now"}
      </button>
    </>
  );
}
