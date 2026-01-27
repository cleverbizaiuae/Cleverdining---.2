import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import axiosInstance from "@/lib/axios";

const SuccessPage = () => {
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Cleanup function - clears ALL session-related state for complete isolation
  const cleanupSession = () => {
    localStorage.removeItem("userInfo");
    localStorage.removeItem("guest_session_token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("pending_order_id");
    localStorage.removeItem("bulk_checkout");
    // Clear chat/messages state for session isolation
    localStorage.removeItem("chat_messages_cache");
    localStorage.removeItem("newMessage");
    localStorage.removeItem("cart");
  };

  useEffect(() => {
    // Prevent back navigation
    window.history.pushState(null, "", window.location.href);
    window.onpopstate = function () {
      window.history.go(1);
    };

    // Fetch restaurant info including Google Review URL
    const fetchRestaurantInfo = async () => {
      try {
        const orderId = localStorage.getItem("pending_order_id");
        const guestToken = localStorage.getItem("guest_session_token");

        if (orderId && guestToken) {
          // Fetch order to get restaurant info
          const res = await axiosInstance.get(`/api/customer/uncomplete/orders/${orderId}/`, {
            headers: { "X-Guest-Session-Token": guestToken }
          });

          if (res.data) {
            setRestaurantName(res.data.restaurant_name || "");
            // The restaurant google_review_url should be included in order response
            // If not, we need to add it to the order serializer
            setGoogleReviewUrl(res.data.restaurant_google_review_url || res.data.google_review_url || null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch restaurant info:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurantInfo();

    // Auto cleanup after delay (session ends)
    const timer = setTimeout(() => {
      cleanupSession();
    }, 120000); // 2 minutes

    return () => clearTimeout(timer);
  }, []);

  const handleGoogleReview = () => {
    if (!googleReviewUrl) {
      // No URL configured - don't do anything
      return;
    }

    // Cleanup session before leaving
    cleanupSession();

    // Open in new tab/window (external)
    window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white sm:bg-slate-50 items-center justify-center sm:p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full h-full sm:h-auto sm:max-w-md bg-white sm:rounded-3xl sm:shadow-xl sm:border sm:border-slate-100 flex flex-col p-6 overflow-y-auto sm:overflow-visible"
      >
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">

          {/* Success Icon */}
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-8 shadow-sm">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <CheckCircle2 size={48} className="text-green-500" strokeWidth={2.5} />
            </motion.div>
          </div>

          {/* Main Title - Centered */}
          <h1 className="text-2xl font-bold text-slate-900 mb-4 text-center">
            Payment Successful!
          </h1>

          {/* Supporting Text - Centered */}
          <p className="text-slate-500 text-base mb-6 text-center leading-relaxed max-w-[90%]">
            Thanks for dining with us, we hope you enjoyed your meal!
          </p>

          {/* Google Review Section - Only show if URL is configured */}
          {!loading && googleReviewUrl && (
            <>
              {/* Call-to-Action Message - Centered */}
              <p className="text-slate-600 text-sm mb-8 text-center leading-relaxed max-w-[85%]">
                Leave a quick Google review and let us know how we did.
              </p>

              {/* Google Review Button */}
              <button
                onClick={handleGoogleReview}
                className="w-full max-w-xs flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 py-4 px-6 rounded-xl font-semibold text-slate-800 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
              >
                {/* Google "G" Icon */}
                <svg viewBox="0 0 24 24" width="24" height="24" className="shrink-0">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Leave a Google Review</span>
              </button>
            </>
          )}

          {/* Fallback message if no Google Review URL configured */}
          {!loading && !googleReviewUrl && (
            <p className="text-slate-400 text-sm text-center mt-4">
              Thank you for your visit!
            </p>
          )}

        </div>

        {/* Footer - Session ends text */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-300">Session ends automatically</p>
        </div>

      </motion.div>
    </div>
  );
};

export default SuccessPage;
