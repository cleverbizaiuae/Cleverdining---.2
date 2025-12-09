// import { useSearchParams } from "react-router-dom";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
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

  return (
    <div className="p-4 h-full overflow-y-auto pb-24">
      <h1 className="text-lg font-bold mb-4">Checkout</h1>
      <CheckoutButton orderId={orderId} />
    </div>
  );
}
