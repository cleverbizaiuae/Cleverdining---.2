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
      const guestSessionToken = localStorage.getItem("guest_session_token");
      await axiosInstance.post('/api/reviews/create/', {
        order: parseInt(orderId),
        rating: rating,
        guest_no: 1,
        name: name || undefined,
        comment: comment || undefined
      }, {
        headers: guestSessionToken ? { 'X-Guest-Session-Token': guestSessionToken } : {}
      });
      toast.success("Thanks for your feedback!");
      setSubmitted(true);
      setTimeout(() => {
        cleanupSession();
        window.location.href = "https://officialcleverdiningcustomer.netlify.app/scan-table";
      }, 2000);
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
    <div className="flex flex-col h-screen w-full bg-white sm:bg-slate-50 items-center justify-center sm:p-4">
      {/* 
        Mobile: Full screen content 
        Desktop: Card 
      */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full h-full sm:h-auto sm:max-w-md bg-white sm:rounded-3xl sm:shadow-xl sm:border sm:border-slate-100 flex flex-col p-6 overflow-y-auto sm:overflow-visible"
      >
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">

          {/* Success Icon */}
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 shadow-sm animate-bounce-short">
            <CheckCircle2 size={40} className="text-blue-600" strokeWidth={3} />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed max-w-[80%] mx-auto">
            Thanks for dining with us! We hope you enjoyed your meal.
          </p>

          {/* Rating Section */}
          <div className="w-full bg-slate-50 rounded-2xl p-4 mb-4 border border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Rate Experience</p>
            <div className="flex justify-center gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  onClick={() => !submitted && setRating(i)}
                  onMouseEnter={() => !submitted && setHoverRating(i)}
                  onMouseLeave={() => setHoverRating(0)}
                  disabled={submitted || submitting}
                  className="focus:outline-none transition-transform active:scale-90"
                >
                  <Star
                    size={32}
                    className={`transition-colors ${(hoverRating || rating) >= i
                      ? "text-yellow-400 fill-yellow-400 drop-shadow-sm"
                      : "text-slate-200 fill-slate-50"
                      }`}
                  />
                </button>
              ))}
            </div>
            <div className="text-xs text-center text-slate-400 font-medium h-4">
              {rating === 5 ? "Excellent!" : rating === 4 ? "Good" : rating === 3 ? "Okay" : rating > 0 ? "Could be better" : ""}
            </div>
          </div>

          {/* Inputs - Show compacted if low space? No, ensure good UX */}
          {!submitted && (
            <div className="w-full space-y-3">
              <input
                type="text"
                placeholder="Your Name (Optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-medium text-slate-800 placeholder:text-slate-400"
              />
              <textarea
                placeholder="Any feedback for the chef? (Optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2} // Reduced rows to save space
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-medium text-slate-800 placeholder:text-slate-400"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 space-y-3">
          {!submitted ? (
            <button
              onClick={handleSubmitReview}
              disabled={submitting || rating === 0}
              className={`w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all shadow-lg shadow-blue-200
                ${rating === 0
                  ? "bg-slate-300 cursor-not-allowed text-slate-50 shadow-none"
                  : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
                }`}
            >
              {submitting ? "Sending..." : "Submit Review"}
            </button>
          ) : (
            <div className="bg-green-50 text-green-700 py-3 rounded-xl font-bold text-sm border border-green-100 animate-in fade-in zoom-in">
              Review Submitted!
            </div>
          )}



          <p className="text-[10px] text-slate-300 mt-2">Session ends automatically</p>
        </div>

      </motion.div>
    </div>
  );
};

export default SuccessPage;
