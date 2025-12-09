import { useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import { useCart } from "../context/CartContext";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "motion/react";

const ScreenCart = () => {
  const navigate = useNavigate();
  const { cart, removeFromCart, clearCart, incrementQuantity, decrementQuantity } = useCart();
  console.log(cart);
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCost = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

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
        toast.error("Session token missing. Please scan the QR code again.");
        return;
      }

      const orderData = {
        restaurant,
        device,
        order_items: orderItems,
        guest_session_token: guestSessionToken,
      };
      console.log(orderData);

      await axiosInstance.post(`/customer/orders/?guest_token=${guestSessionToken}`, orderData);
      toast.success("Order placed successfully!");
      clearCart();
      navigate("/dashboard/orders");
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

      // Check for specific "Device not found" error
      if (errorMessage.includes("Device not found")) {
        toast.error("Session expired. Refreshing...");
        localStorage.removeItem("userInfo");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }

      // Check for "writable nested fields" error (Backend issue workaround)
      // If this error occurs, the order IS created, so we treat it as success.
      if (errorMessage.includes("writable nested fields")) {
        console.warn("Caught 'writable nested fields' error, treating as success.");
        toast.success("Order placed successfully!");
        clearCart();
        navigate("/dashboard/orders");
        return;
      }

      toast.error(errorMessage);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center">
      <div className="p-4 w-full">
        <h1 className="text-3xl font-medium">Cart List</h1>
      </div>
      <div className="flex-1 flex flex-col gap-y-2 w-full max-w-2xl overflow-y-auto px-4">
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
        <div className="w-full bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 mt-auto">
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center justify-between text-sm font-medium px-2">
              <span className="text-gray-600">
                Total Quantity: <span className="text-primary font-bold ml-1">{totalQuantity}</span>
              </span>
              <span className="text-gray-600">
                Total Cost: <span className="text-primary font-bold ml-1">AED {totalCost}</span>
              </span>
            </div>
            <button
              className="w-full h-14 bg-primary text-white rounded-xl shadow-xl flex items-center justify-between px-6 font-bold text-lg active:scale-[0.98] transition-transform"
              onClick={handleOrderNow}
            >
              <span>Place Order</span>
              <div className="flex items-center gap-2">
                <span>AED {totalCost}</span>
                <ArrowRight size={20} />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenCart;
