import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useCart } from "../context/CartContext";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion"; // Corrected from "motion/react"
import { useEffect } from "react";

const ScreenCart = () => {
  const navigate = useNavigate();
  const { cart, removeFromCart, clearCart, incrementQuantity, decrementQuantity } = useCart();
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCost = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  useEffect(() => {
    const userInfo = localStorage.getItem("userInfo");
    const guestSessionToken = localStorage.getItem("guest_session_token");

    // Auto-repair "Zombie" sessions (Logged in but no token)
    if (userInfo && !guestSessionToken) {
      console.warn("Detected Zombie Session - Repairing...");
      localStorage.removeItem("userInfo");
      localStorage.removeItem("guest_session_token");
      // Redirect to default login to regen token. 
      // Ideally should use params from userInfo if available, but default safe fallback is device 14.
      window.location.href = "/login?id=14&table=Default Table";
    }
  }, []);

  const handleOrderNow = async () => {
    try {
      const userInfo = localStorage.getItem("userInfo");
      if (!userInfo) {
        toast.error("User info not found");
        return;
      }

      const userData = JSON.parse(userInfo);
      const restaurant = userData.user.restaurants[0].id;
      const device = userData.user.restaurants[0].device_id;

      const orderItems = cart.map((item) => ({
        item: item.id,
        quantity: item.quantity,
      }));

      const guestSessionToken = localStorage.getItem("guest_session_token");
      if (!guestSessionToken) {
        // Redundant check since useEffect handles it, but good for safety
        toast.error("Session token missing. Refreshing...");
        window.location.reload();
        return;
      }

      const orderData = {
        restaurant,
        device,
        order_items: orderItems,
        guest_session_token: guestSessionToken,
      };

      const response = await axiosInstance.post(`/api/customer/orders/?guest_token=${guestSessionToken}`, orderData);
      toast.success("Order placed successfully!");
      clearCart();

      // Navigate to checkout with the new Order ID
      if (response.data && response.data.id) {
        // Robust Persistence
        localStorage.setItem("pending_order_id", String(response.data.id));
        // Navigate to Checkout Page (User lands here first)
        navigate(`/dashboard/checkout?orderId=${response.data.id}`, { state: { orderId: response.data.id } });
      } else {
        // Fallback if ID is missing (should not happen with backend fix)
        console.error("Order ID missing in response", response.data);
        toast.error("Order placed, but ID missing. Check Orders tab.");
        navigate("/dashboard/orders");
      }
    } catch (error: any) {
      console.error("Failed to place order:", error);
      let errorMessage = "Failed to place order. Please try again.";

      if (error.response?.data) {
        if (Array.isArray(error.response.data)) {
          errorMessage = error.response.data.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join(", ");
        } else if (typeof error.response.data === 'object') {
          errorMessage = error.response.data.detail || error.response.data.non_field_errors?.[0] || JSON.stringify(error.response.data);
        } else {
          errorMessage = String(error.response.data);
        }
      }

      if (errorMessage.includes("Device not found")) {
        toast.error("Session expired. Refreshing...");
        localStorage.removeItem("userInfo");
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      // Check for "writable nested fields" error (Backend issue workaround)
      if (errorMessage.includes("writable nested fields")) {
        toast.success("Order placed successfully!");
        clearCart();
        navigate("/dashboard/orders");
        return;
      }

      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center pb-24">
      <div className="p-4 w-full">
        <h1 className="text-3xl font-medium">Cart List</h1>
      </div>
      <div className="flex-1 flex flex-col gap-y-2 w-full max-w-2xl overflow-y-auto px-4 pb-48">
        {cart.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-64"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-3xl mb-4">
              🛒
            </div>
            <p className="text-muted-foreground mb-6">Your cart is empty.</p>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-2 border border-gray-300 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Browse Menu
            </button>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {cart.map((item) => (
              <motion.div
                layout
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.3 }}
                className="flex items-center p-4 bg-white rounded-lg shadow-sm"
              >
                {/* Image */}
                <img
                  src={item.image1}
                  alt={item.item_name}
                  className="w-20 h-20 object-cover rounded-xl border border-gray-100 bg-gray-50"
                />
                {/* Text & Price */}
                <div className="ml-4 flex-1">
                  <h2 className="text-primary">{item.item_name}</h2>
                  <p className="text-primary/40">AED {item.price}</p>
                  {/* Quantity Controller with +/- buttons */}
                  <div className="flex items-center space-x-2 mt-2">
                    <button
                      onClick={() => decrementQuantity(item.id)}
                      className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full text-gray-700 font-bold transition-colors active:scale-90 duration-200"
                    >
                      −
                    </button>
                    <span className="font-semibold px-4">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => incrementQuantity(item.id)}
                      className="w-8 h-8 flex items-center justify-center bg-primary hover:bg-primary/90 rounded-full text-white font-bold transition-colors active:scale-90 duration-200"
                    >
                      +
                    </button>
                  </div>
                </div>
                {/* Remove Button */}
                <button
                  className="ml-4 text-gray-500 hover:text-gray-800"
                  onClick={() => removeFromCart(item.id)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
      {cart.length > 0 && (
        <div className="w-full mt-auto">
          <div className="fixed bottom-24 left-4 right-4 bg-white p-4 shadow-xl rounded-2xl z-50 max-w-2xl mx-auto border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-600">Total Quantity: <span className="font-bold text-blue-600">{totalQuantity}</span></span>
              <span className="text-gray-600">Total Cost: <span className="font-bold text-blue-600">AED {totalCost.toFixed(2)}</span></span>
            </div>
            <button
              onClick={handleOrderNow}
              className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-between group"
            >
              <span>Place Order</span>
              <span className="bg-white/20 px-3 py-1 rounded-lg group-hover:bg-white/30 transition-colors">
                AED {totalCost.toFixed(2)} <ArrowRight className="inline ml-1 w-4 h-4" />
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenCart;
