import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Star } from "lucide-react";
import { motion } from "motion/react";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";

const SuccessPage = () => {
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // 1. Capture Order ID BEFORE clearing
    const pendingId = localStorage.getItem("pending_order_id");

    // Also check URL params for bulk session ID (though less useful for single review)
    const params = new URLSearchParams(window.location.search);
    // const sessionId = params.get("session_id"); // e.g. bulk_cash_43

    if (pendingId) {
      setOrderId(pendingId);
    } else {
      // Fallback: Try to fetch latest paid order for this device?
      // For now, relies on pending_order_id being present.
      // If coming from card payment redirect, pending_order_id might have been set during checkout init.
    }

    // Clear sensitive session data on mount, BUT keep pending_order_id in state
    localStorage.removeItem("userInfo");
    localStorage.removeItem("guest_session_token");
    localStorage.removeItem("accessToken");
    // localStorage.removeItem("pending_order_id"); // Don't clear immediately if we want to use it? 
    // Actually, usually we want to clear it to prevent stale state. 
    // But we captured it in state above. So safe to clear from storage if needed.
    // Let's clear it now.
    localStorage.removeItem("pending_order_id");

    // Prevent back navigation
    window.history.pushState(null, "", window.location.href);
    window.onpopstate = function () {
      window.history.go(1);
    };
  }, []);

  const handleSubmitReview = async (selectedRating: number) => {
    if (!orderId) {
      toast.error("Order context missing. Cannot submit review.");
      return;
    }

    setSubmitting(true);
    try {
      await axiosInstance.post('/api/reviews/create/', {
        order: parseInt(orderId),
        rating: selectedRating,
        guest_no: 1 // Default
      });
      toast.success("Thanks for your feedback!");
      setSubmitted(true);
    } catch (error) {
      console.error("Review failed", error);
      toast.error("Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStarClick = (star: number) => {
    if (submitted) return;
    setRating(star);
    handleSubmitReview(star);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 items-center justify-center p-6 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm flex flex-col items-center border border-gray-100"
      >
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={40} className="text-green-600" strokeWidth={3} />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-gray-500 mb-6 leading-relaxed">
          Thanks for dining with us today. We hope everything was delicious. See you again soon!
        </p>

        <div className="flex flex-col items-center gap-2 mb-8">
          <p className="text-sm font-bold text-gray-700">Rate your experience</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onClick={() => handleStarClick(i)}
                onMouseEnter={() => setHoverRating(i)}
                onMouseLeave={() => setHoverRating(0)}
                disabled={submitted || submitting}
                className="transition-transform hover:scale-110 focus:outline-none"
              >
                <Star
                  size={32}
                  className={`transition-colors ${(hoverRating || rating) >= i
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-gray-300 fill-gray-100"
                    }`}
                />
              </button>
            ))}
          </div>
          {submitted && <p className="text-xs text-green-600 font-bold animate-pulse">Thank you!</p>}
        </div>

        <div className="w-full h-px bg-gray-100 mb-6"></div>

        <p className="text-xs text-gray-400 mb-2">You will be logged out automatically.</p>

        <button
          onClick={() => {
            window.location.href = "/login";
          }}
          className="w-full bg-gray-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-gray-800 transition-colors"
        >
          Back to Home
        </button>
      </motion.div>
    </div>
  );
};

export default SuccessPage;
