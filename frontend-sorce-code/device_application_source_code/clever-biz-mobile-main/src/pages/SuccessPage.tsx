import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, RefreshCw, Star } from "lucide-react";
import { motion } from "motion/react";
import toast from "react-hot-toast";
import axiosInstance from "@/lib/axios";
import { clearGuestSessionStorage } from "@/lib/guestSessionStorage";

const VERIFIED_PAYMENT_STATUSES = new Set([
  "completed",
  "paid",
  "success",
  "succeeded",
  "captured",
  "payment_received",
  "payment_approved",
]);

const FAILED_PAYMENT_STATUSES = new Set([
  "failed",
  "declined",
  "cancelled",
  "canceled",
]);

const SuccessPage = () => {
  const navigate = useNavigate();
  const paymentParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeSessionId = params.get("session_id");
    const checkoutSessionId = params.get("cko-session-id");
    const transactionId = params.get("transaction_id") || params.get("payment_id");
    const orderId = params.get("order_id");
    return {
      sessionId: stripeSessionId || transactionId,
      checkoutSessionId,
      orderId,
      hasGatewayReference: Boolean(stripeSessionId || checkoutSessionId || transactionId),
    };
  }, []);
  const [paymentVerified, setPaymentVerified] = useState(!paymentParams.hasGatewayReference);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationRetry, setVerificationRetry] = useState(0);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!paymentParams.hasGatewayReference) return;
    let cancelled = false;

    const verifySettlement = async () => {
      setVerificationError(null);
      let lastError = "Payment confirmation is taking longer than expected.";

      for (let attempt = 0; attempt < 4 && !cancelled; attempt += 1) {
        try {
          const verifyPayload = paymentParams.checkoutSessionId
            ? { "cko-session-id": paymentParams.checkoutSessionId }
            : { session_id: paymentParams.sessionId };
          const response = await axiosInstance.post("/api/customer/payment/verify/", verifyPayload);
          const remainingAmount = Number(response.data?.remaining_amount || 0);
          if (response.data?.fully_paid === false || remainingAmount > 0) {
            navigate("/dashboard/orders?payment=partial", { replace: true });
            return;
          }

          const paymentStatus = String(
            response.data?.status || response.data?.payment_status || "",
          ).toLowerCase();
          if (response.data?.fully_paid === true || VERIFIED_PAYMENT_STATUSES.has(paymentStatus)) {
            if (!cancelled) setPaymentVerified(true);
            return;
          }
          if (FAILED_PAYMENT_STATUSES.has(paymentStatus)) {
            lastError = "The payment was not completed. Please return to your orders and try again.";
            break;
          }
        } catch (error) {
          console.error("Failed to verify payment settlement:", error);
          lastError = "We could not confirm the payment with the provider yet.";
        }

        if (attempt < 3) {
          await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
        }
      }

      if (!cancelled) setVerificationError(lastError);
    };

    void verifySettlement();
    return () => {
      cancelled = true;
    };
  }, [navigate, paymentParams, verificationRetry]);

  useEffect(() => {
    const handlePopState = () => {
      window.history.go(1);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleSubmitReview = async () => {
    const orderId = paymentParams.orderId || localStorage.getItem("pending_order_id");
    if (!orderId) {
      toast.error("Order context missing. Cannot submit review.");
      return;
    }

    if (rating === 0) {
      toast.error("Please select a rating first.");
      return;
    }

    setSubmitting(true);
    try {
      const guestSessionToken = localStorage.getItem("guest_session_token");
      await axiosInstance.post("/api/reviews/create/", {
        order: Number.parseInt(orderId, 10),
        rating,
        guest_no: 1,
        name: name || undefined,
        comment: comment || undefined,
      }, {
        headers: guestSessionToken
          ? { "X-Guest-Session-Token": guestSessionToken }
          : {},
      });
      toast.success("Thanks for your feedback!");
      setSubmitted(true);
      clearGuestSessionStorage();
    } catch (error: unknown) {
      console.error("Review failed", error);
      const responseStatus = (
        error &&
        typeof error === "object" &&
        "response" in error
      )
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
      if (responseStatus === 401 || responseStatus === 403) {
        toast.error("Session expired. Thanks for dining with us!");
        setSubmitted(true);
        clearGuestSessionStorage();
      } else {
        toast.error("Failed to submit review");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!paymentVerified && verificationError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-3 text-2xl font-semibold">Confirming your payment</h1>
          <p className="mb-6 text-sm leading-relaxed text-white/65">{verificationError}</p>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setVerificationRetry((current) => current + 1)}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 font-semibold text-slate-950"
            >
              <RefreshCw className="h-4 w-4" />
              Retry confirmation
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard/orders", { replace: true })}
              className="min-h-12 rounded-xl border border-white/20 px-4 font-semibold text-white"
            >
              Return to orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!paymentVerified) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-white">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white"
          aria-label="Verifying payment"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 text-center sm:p-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex w-full max-w-sm flex-col items-center rounded-3xl border border-gray-100 bg-white p-6 shadow-xl sm:p-8"
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 sm:mb-6 sm:h-20 sm:w-20">
          <CheckCircle2 size={36} className="text-green-600 sm:h-10 sm:w-10" strokeWidth={3} />
        </div>

        <h1 className="mb-2 text-xl font-bold text-gray-900 sm:text-2xl">Payment Successful!</h1>
        <p className="mb-4 text-sm leading-relaxed text-gray-500 sm:mb-6 sm:text-base">
          Thanks for dining with us today. We hope everything was delicious. See you again soon!
        </p>

        <div className="mb-4 flex w-full flex-col items-center gap-2 sm:mb-6">
          <p className="text-sm font-bold text-gray-700">Rate your experience</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`Rate ${value} out of 5`}
                onClick={() => !submitted && setRating(value)}
                onMouseEnter={() => !submitted && setHoverRating(value)}
                onMouseLeave={() => setHoverRating(0)}
                disabled={submitted || submitting}
                className="transition-transform hover:scale-110 focus:outline-none disabled:cursor-default"
              >
                <Star
                  size={28}
                  className={`transition-colors sm:h-8 sm:w-8 ${
                    (hoverRating || rating) >= value
                      ? "fill-yellow-400 text-yellow-400"
                      : "fill-gray-100 text-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 w-full space-y-3 sm:mb-6">
          <input
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitted}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <textarea
            placeholder="Share your thoughts... (optional)"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={submitted}
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmitReview}
            disabled={submitting || rating === 0}
            className={`mb-4 w-full rounded-xl px-6 py-2.5 font-bold text-white transition-all sm:py-3 ${
              rating === 0
                ? "cursor-not-allowed bg-gray-300"
                : "bg-green-600 hover:bg-green-700 active:scale-[0.98]"
            } disabled:opacity-70`}
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        ) : (
          <p className="mb-4 animate-pulse text-sm font-bold text-green-600">
            Thank you for your feedback!
          </p>
        )}

        <div className="mb-4 h-px w-full bg-gray-100" />

        <p className="mb-2 text-xs text-gray-400">You will be logged out automatically.</p>

        <button
          type="button"
          onClick={() => {
            clearGuestSessionStorage();
            window.location.href = "/login";
          }}
          className="w-full rounded-xl bg-gray-900 px-6 py-2.5 font-bold text-white transition-colors hover:bg-gray-800 sm:py-3"
        >
          Back to Home
        </button>
      </motion.div>
    </div>
  );
};

export default SuccessPage;
