import { useState } from "react";
import axiosInstance from "../lib/axios";
import { loadStripe } from "@stripe/stripe-js";
import toast from "react-hot-toast";

export default function CheckoutButton({
  orderId,
  disabled,
}: {
  orderId: number | string;
  disabled?: boolean;
}) {
  console.log(orderId);
  const [loading, setLoading] = useState(false);
  const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PK!);

  const handleCheckout = async () => {
    if (loading) return; // Prevent double clicks
    try {
      setLoading(true);

      const guestToken = localStorage.getItem("guest_session_token");
      if (!guestToken) {
        toast.error("Session expired. Please log in again.");
        return;
      }

      console.log("Using Token:", guestToken.slice(0, 10) + "...");

      const res = await axiosInstance.post(
        `/customer/create-checkout-session/${orderId}/?guest_token=${guestToken}`,
        {},
        {
          headers: {
            "X-Guest-Session-Token": guestToken
          }
        }
      );
      const url: string | undefined = res?.data?.url;
      const sessionId: string | undefined = res?.data?.sessionId;

      if (!sessionId && !url)
        throw new Error("No checkout URL or sessionId returned");

      if (sessionId) {
        try {
          // Razorpay / Other pre-check
          const probe = await axiosInstance.get(`/customer/payment/success/`, {
            params: { session_id: sessionId, order_id: String(orderId) },
          });
          if (probe?.data?.confirmed) {
            window.location.href = `/dashboard/success?session_id=${encodeURIComponent(
              sessionId
            )}&order_id=${encodeURIComponent(String(orderId))}`;
            return;
          }
          console.log(probe);
        } catch {
          toast.error("Payment failed");
        }
      }

      if (url) {
        window.location.href = url;
        return;
      }
      const stripe = await stripePromise;
      if (!stripe) throw new Error("Stripe not loaded");
      const { error } = await stripe.redirectToCheckout({
        sessionId: sessionId!,
      });
      if (error) throw error;
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
        className={`w-full px-4 py-2 rounded-md font-semibold transition-colors duration-300 
    ${disabled || loading
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-green-600 hover:bg-green-700 text-white"
          }
  `}
      >
        {loading ? "Processing Payment..." : "Checkout"}
      </button>
    </>
  );
}
