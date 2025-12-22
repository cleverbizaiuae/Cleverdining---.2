import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Star } from "lucide-react";
import { motion } from "motion/react";

const SuccessPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Clear session data on mount
    localStorage.removeItem("userInfo");
    localStorage.removeItem("guest_session_token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("pending_order_id");

    // Prevent back navigation
    window.history.pushState(null, "", window.location.href);
    window.onpopstate = function () {
      window.history.go(1);
    };
  }, []);

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

        <div className="flex gap-1 mb-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={24} className="text-yellow-400 fill-yellow-400" />
          ))}
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
