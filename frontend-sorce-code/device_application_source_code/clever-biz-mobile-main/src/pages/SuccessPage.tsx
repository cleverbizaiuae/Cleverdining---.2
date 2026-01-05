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
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");

  // Cleanup function
  const cleanupSession = () => {
    localStorage.removeItem("userInfo");
    localStorage.removeItem("guest_session_token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("pending_order_id");
    localStorage.removeItem("bulk_checkout");
  };

  useEffect(() => {
    const pendingId = localStorage.getItem("pending_order_id");
    if (pendingId) {
      setOrderId(pendingId);
    }

    // Prevent back navigation
    window.history.pushState(null, "", window.location.href);
    window.onpopstate = function () {
      window.history.go(1);
    };
  }, []);

  const handleSubmitReview = async () => {
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
      await axiosInstance.post('/api/reviews/create/', {
        order: parseInt(orderId),
        rating: rating,
        guest_no: 1,
        name: name || undefined,
        comment: comment || undefined
      });
      toast.success("Thanks for your feedback!");
      setSubmitted(true);
      cleanupSession();
    } catch (error: any) {
      console.error("Review failed", error);
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        toast.error("Session expired. Thanks for dining with us!");
        setSubmitted(true);
        cleanupSession();
      } else {
        toast.error("Failed to submit review");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 items-center justify-center p-4 sm:p-6 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl w-full max-w-sm flex flex-col items-center border border-slate-100"
      >
        {/* Success Icon - Blue Theme */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4 sm:mb-6">
          <CheckCircle2 size={36} className="text-blue-600 sm:w-10 sm:h-10" strokeWidth={3} />
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h1>
        <p className="text-slate-500 text-sm sm:text-base mb-4 sm:mb-6 leading-relaxed">
          Thanks for dining with us today. We hope everything was delicious. See you again soon!
        </p>

        {/* Rate Your Experience */}
        <div className="flex flex-col items-center gap-2 mb-4 sm:mb-6 w-full">
          <p className="text-sm font-bold text-slate-700">Rate your experience</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onClick={() => !submitted && setRating(i)}
                onMouseEnter={() => !submitted && setHoverRating(i)}
                onMouseLeave={() => setHoverRating(0)}
                disabled={submitted || submitting}
                className="transition-transform hover:scale-110 focus:outline-none disabled:cursor-default"
              >
                <Star
                  size={28}
                  className={`transition-colors sm:w-8 sm:h-8 ${(hoverRating || rating) >= i
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-slate-300 fill-slate-100"
                    }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Comment Section */}
        <div className="w-full space-y-3 mb-4 sm:mb-6">
          <input
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitted}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
          />
          <textarea
            placeholder="Share your thoughts... (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={submitted}
            rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {/* Submit Button - Blue Theme */}
        {!submitted ? (
          <button
            onClick={handleSubmitReview}
            disabled={submitting || rating === 0}
            className={`w-full py-2.5 sm:py-3 px-6 rounded-xl font-bold text-white transition-all mb-4
              ${rating === 0
                ? "bg-slate-300 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
              } disabled:opacity-70`}
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        ) : (
          <p className="text-sm text-blue-600 font-bold mb-4 animate-pulse">Thank you for your feedback!</p>
        )}

        <div className="w-full h-px bg-slate-100 mb-4"></div>

        <p className="text-xs text-slate-400 mb-2">You will be logged out automatically.</p>

        <button
          onClick={() => {
            cleanupSession();
            window.location.href = "/login";
          }}
          className="w-full bg-slate-900 text-white font-bold py-2.5 sm:py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors"
        >
          Back to Home
        </button>
      </motion.div>
    </div>
  );
};

export default SuccessPage;
