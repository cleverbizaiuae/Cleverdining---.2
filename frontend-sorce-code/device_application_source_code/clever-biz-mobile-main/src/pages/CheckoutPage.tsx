// import { useSearchParams } from "react-router-dom";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import CheckoutButton from "./CheckoutButton";
// import CheckoutButton from "../components/CheckoutButton";

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Prioritize state -> query param -> localStorage (Bulletproof fallback)
  const orderId = location.state?.orderId || params.get("orderId") || localStorage.getItem("pending_order_id");


  console.log("CheckoutPage Debug:", {
    stateId: location.state?.orderId,
    paramId: params.get("orderId"),
    storageId: localStorage.getItem("pending_order_id"),
    fullUrl: window.location.href,
    search: location.search
  });

  useEffect(() => {
    if (!orderId) {
      // Redirect back to cart if no Order ID found
      const timer = setTimeout(() => {
        navigate("/dashboard/cart");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [orderId, navigate]);

  if (!orderId) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] p-4 text-center">
        <p className="text-lg font-semibold text-red-500 mb-2">Order ID missing</p>
        <p className="text-gray-500">Redirecting to cart...</p>
      </div>
    );
  }

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');

  return (
    <div className="p-4 h-full overflow-y-auto pb-24 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">Checkout</h1>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Payment Method</h2>

        <div className="space-y-3">
          {/* Card Option */}
          <label
            className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all duration-200
            ${paymentMethod === 'card' ? 'border-green-500 bg-green-50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}
          `}
          >
            <input
              type="radio"
              name="payment"
              value="card"
              checked={paymentMethod === 'card'}
              onChange={() => setPaymentMethod('card')}
              className="mr-3 h-5 w-5 text-green-600 focus:ring-green-500"
            />
            <div className="flex-1">
              <span className="font-semibold block text-gray-800">Pay by Card</span>
              <span className="text-sm text-gray-500">Secure online payment</span>
            </div>
            <span className="text-2xl">💳</span>
          </label>

          {/* Cash Option */}
          <label
            className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all duration-200
            ${paymentMethod === 'cash' ? 'border-yellow-500 bg-yellow-50 shadow-sm' : 'border-gray-200 hover:border-gray-300'}
          `}
          >
            <input
              type="radio"
              name="payment"
              value="cash"
              checked={paymentMethod === 'cash'}
              onChange={() => setPaymentMethod('cash')}
              className="mr-3 h-5 w-5 text-yellow-600 focus:ring-yellow-500"
            />
            <div className="flex-1">
              <span className="font-semibold block text-gray-800">Pay by Cash</span>
              <span className="text-sm text-gray-500">Pay directly to staff</span>
            </div>
            <span className="text-2xl">💵</span>
          </label>
        </div>
      </div>

      <div className="mt-8">
        <CheckoutButton
          orderId={orderId}
          provider={paymentMethod === 'card' ? undefined : 'cash'}
        />
        {paymentMethod === 'cash' && (
          <p className="text-center text-sm text-gray-500 mt-3">
            A staff member will come to your table to collect payment.
          </p>
        )}
      </div>
    </div>
  );
}
