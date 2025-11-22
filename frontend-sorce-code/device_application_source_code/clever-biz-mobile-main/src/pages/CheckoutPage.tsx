// import { useSearchParams } from "react-router-dom";
import { useSearchParams } from "react-router";
import CheckoutButton from "./CheckoutButton";
// import CheckoutButton from "../components/CheckoutButton";

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const orderId = params.get("orderId");

  if (!orderId) {
    return <p>Order ID missing</p>;
  }
  console.log(orderId);

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold mb-4">Checkout</h1>
      <CheckoutButton orderId={orderId} />
    </div>
  );
}
