import { useNavigate } from "react-router";
import { useCart } from "../context/CartContext";
import axiosInstance from "../lib/axios";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "motion/react";

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

      const orderData = {
        restaurant,
        device,
        order_items: orderItems,
      };
      console.log(orderData);

      await axiosInstance.post("/customer/orders/", orderData);
      toast.success("Order placed successfully!");
      clearCart();
      navigate("/dashboard/orders");
    } catch (error: any) {
      console.error("Failed to place order:", error);
      const errorMessage = error.response?.data?.detail || error.response?.data?.non_field_errors?.[0] || "Failed to place order. Please try again.";
      toast.error(errorMessage);
    }
  };

  return (
    <div className="h-full p-4 flex flex-col items-center">
      <div>
        <h1 className="text-3xl font-medium">Cart List</h1>
      </div>
      <div className="flex-1 flex flex-col gap-y-2 mt-8 w-full max-w-2xl overflow-y-auto">
        {cart.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-primary/60"
          >
            Your cart is empty.
          </motion.p>
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
      <div className="w-full mt-4 ">
        <div className="w-full flex flex-col gap-2 rounded-lg shadow-md bg-[#F6F9FF] p-2 text-primary">
          <div className="flex flex-wrap justify-center gap-3 text-sm font-medium">
            <span>
              Total Quantity:{" "}
              <span className="border px-2 py-1 rounded-md">
                {totalQuantity}
              </span>
            </span>
            <span>
              Total Cost:{" "}
              <span className="border px-2 py-1 rounded-md">AED {totalCost}</span>
            </span>
          </div>
          <button
            className="button-primary xl:w-1/2 w-full mx-auto"
            onClick={handleOrderNow}
            disabled={cart.length === 0}
          >
            Order Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScreenCart;
