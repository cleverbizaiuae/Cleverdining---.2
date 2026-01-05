import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Send, Instagram, Facebook, Twitter } from "lucide-react";
import { motion } from "motion/react";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";

// Import logo - update path if needed
import logo from "../assets/cleverbiz_full_logo.png";

const SuccessPage = () => {
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");

  // Cleanup function - moved from mount to after review or when leaving
  const cleanupSession = () => {
    localStorage.removeItem("userInfo");
    localStorage.removeItem("guest_session_token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("pending_order_id");
    localStorage.removeItem("bulk_checkout");
  };

  useEffect(() => {
    // 1. Capture Order ID
    const pendingId = localStorage.getItem("pending_order_id");

    if (pendingId) {
      setOrderId(pendingId);
    }

    // DON'T clear tokens here - need them for review API call!
    // Cleanup will happen after review submission or when clicking "Back to Home"

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
        guest_no: 1, // Default
        guest_name: name || undefined,
        comment: comment || undefined
      });
      toast.success("Thanks for your feedback!");
      setSubmitted(true);

      // Cleanup AFTER successful review
      cleanupSession();
    } catch (error: any) {
      console.error("Review failed", error);
      // If auth failure, still cleanup and show generic message
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        toast.error("Session expired. Thanks for dining with us!");
        setSubmitted(true); // Prevent retry loop
        cleanupSession();
      } else {
        toast.error("Failed to submit review");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 items-center justify-start p-6 pt-12 text-center">
      {/* Logo */}
      <motion.img
        src={logo}
        alt="CleverBiz"
        className="h-10 mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      />

      {/* Thank You Heading */}
      <motion.h1
        className="text-3xl font-bold text-slate-900 mb-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Thank You
      </motion.h1>
      <motion.p
        className="text-slate-500 mb-8 max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        We hope you enjoyed your meal. See you again soon!
      </motion.p>

      {/* Review Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="bg-white p-6 rounded-2xl shadow-lg w-full max-w-md border border-slate-100"
      >
        <p className="text-sm font-semibold text-slate-700 mb-4">How was your experience?</p>

        {/* Star Rating */}
        <div className="flex justify-center gap-2 mb-6">
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
                size={32}
                className={`transition-colors ${(hoverRating || rating) >= i
                  ? "text-yellow-400 fill-yellow-400"
                  : "text-slate-300 fill-slate-100"
                  }`}
              />
            </button>
          ))}
        </div>

        {/* Name Input (Optional) */}
        <input
          type="text"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitted}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
        />

        {/* Comment Textarea */}
        <textarea
          placeholder="Share your thoughts..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={submitted}
          rows={3}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl mb-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
        />

        {/* Submit Button */}
        <button
          onClick={handleSubmitReview}
          disabled={submitted || submitting || rating === 0}
          className={`w-full py-3 px-6 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all
            ${submitted
              ? "bg-green-500 cursor-default"
              : rating === 0
                ? "bg-slate-300 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
            } disabled:opacity-70`}
        >
          {submitting ? (
            <span className="animate-pulse">Submitting...</span>
          ) : submitted ? (
            <span>Thank You! ✓</span>
          ) : (
            <>
              <span>Submit Review</span>
              <Send size={18} />
            </>
          )}
        </button>
      </motion.div>

      {/* Social Links */}
      <motion.div
        className="mt-10 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Follow Us</p>
        <div className="flex justify-center gap-4">
          <a href="#" className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors">
            <Instagram size={18} />
          </a>
          <a href="#" className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors">
            <Facebook size={18} />
          </a>
          <a href="#" className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 transition-colors">
            <Twitter size={18} />
          </a>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        className="mt-auto pt-10 pb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <p className="text-xs text-slate-400">Powered by</p>
        <p className="text-sm font-bold text-slate-500">Cleverbiz<sup className="text-[8px]">™</sup></p>
      </motion.div>
    </div>
  );
};

export default SuccessPage;

