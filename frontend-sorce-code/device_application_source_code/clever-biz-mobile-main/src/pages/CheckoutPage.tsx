// import { useSearchParams } from "react-router-dom";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import CheckoutButton from "./CheckoutButton";
import axiosInstance from "../lib/axios";
// import CheckoutButton from "../components/CheckoutButton";

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Prioritize state -> query param -> localStorage (Bulletproof fallback)
  const orderId = location.state?.orderId || params.get("orderId") || localStorage.getItem("pending_order_id");
  const isBulkCheckout = location.state?.isBulkCheckout || localStorage.getItem("bulk_checkout") === "true";
  const passedTotalAmount = location.state?.totalAmount || 0;

  console.log("CheckoutPage Debug:", {
    stateId: location.state?.orderId,
    paramId: params.get("orderId"),
    storageId: localStorage.getItem("pending_order_id"),
    isBulkCheckout,
    passedTotalAmount,
    fullUrl: window.location.href,
    search: location.search
  });

  useEffect(() => {
    // Clear bulk_checkout flag after using it
    return () => {
      localStorage.removeItem("bulk_checkout");
    };
  }, []);

  useEffect(() => {
    if (!orderId && !isBulkCheckout) {
      // Redirect back to cart if no Order ID found
      const timer = setTimeout(() => {
        navigate("/dashboard/cart");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [orderId, isBulkCheckout, navigate]);

  if (!orderId && !isBulkCheckout) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] p-4 text-center">
        <p className="text-lg font-semibold text-red-500 mb-2">Order ID missing</p>
        <p className="text-gray-500">Redirecting to cart...</p>
      </div>
    );
  }

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [orderData, setOrderData] = useState<any>(null);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [tipType, setTipType] = useState<'percentage' | 'custom_amount' | 'custom_percentage' | null>(null);
  const [tipValue, setTipValue] = useState<number | string>(''); // 5, 10, 15, or custom input
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [customInput, setCustomInput] = useState<string>('');

  // Fetch Order Data to get Subtotal
  useEffect(() => {
    const guestToken = localStorage.getItem("guest_session_token");

    if (isBulkCheckout && guestToken) {
      // Fetch all unpaid orders for this guest session using correct endpoint
      axiosInstance.get(`/api/customer/uncomplete/orders/`, {
        headers: { "X-Guest-Session-Token": guestToken }
      })
        .then(res => {
          const orders = res.data.results || res.data || [];
          // Filter unpaid orders (backend already filters, but double-check)
          const unpaidOrders = Array.isArray(orders) ? orders.filter((o: any) =>
            ['pending', 'preparing', 'served', 'completed', 'delivered'].includes(o.status) &&
            (!o.payment_status || ['unpaid', 'pending', 'failed'].includes(o.payment_status))
          ) : [];
          setAllOrders(unpaidOrders);
          // Set orderData to first order for CheckoutButton compatibility
          if (unpaidOrders.length > 0) {
            setOrderData(unpaidOrders[0]);
          }
        })
        .catch(err => console.error("Failed to fetch orders", err));
    } else if (orderId) {
      axiosInstance.get(`/api/customer/uncomplete/orders/${orderId}/`)
        .then(res => {
          setOrderData(res.data);
        })
        .catch(err => console.error("Failed to fetch order", err));
    }
  }, [orderId, isBulkCheckout]);

  // Calculate Subtotal - use order.total_price for accuracy
  const subtotal = isBulkCheckout
    ? allOrders.reduce((acc, o) => acc + Number(o.total_price || 0), 0)
    : Number(orderData?.total_price || 0);

  // Collect all items from all orders for display
  const allItems = isBulkCheckout
    ? allOrders.flatMap((o) => (o.items || []).map((item: any) => ({ ...item, orderId: o.id })))
    : (orderData?.items || []);
  // If Tax/Service exists, we should ideally get them.
  // Assuming Subtotal for Tip = Item Total.

  const handlePresetTip = (percent: number) => {
    setTipType('percentage');
    setTipValue(percent);
    setTipAmount(Number((subtotal * (percent / 100)).toFixed(2)));
    setCustomInput('');
  };

  const handleCustomInput = (val: string) => {
    setCustomInput(val);
    if (!val) {
      setTipAmount(0);
      setTipType(null);
      return;
    }

    // Check for %
    if (val.includes('%')) {
      const pct = parseFloat(val.replace('%', ''));
      if (!isNaN(pct) && pct >= 0) {
        setTipType('custom_percentage');
        setTipValue(pct);
        // Validation: Max 50%
        if (pct > 50) {
          setTipAmount(0); // Invalid
          // Visual error?
        } else {
          setTipAmount(Number((subtotal * (pct / 100)).toFixed(2)));
        }
      }
    } else {
      // Direct Amount
      const amt = parseFloat(val);
      if (!isNaN(amt) && amt >= 0) {
        setTipType('custom_amount');
        setTipValue(amt);
        // Validation: Max 50% of subtotal
        if (amt > subtotal * 0.5) {
          setTipAmount(0); // Invalid
        } else {
          setTipAmount(Number(amt.toFixed(2)));
        }
      }
    }
  };

  const finalTotal = (subtotal + tipAmount).toFixed(2);

  return (
    <div className="p-4 h-full overflow-y-auto pb-24 max-w-lg mx-auto">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          <span className="text-sm font-medium">Back</span>
        </button>
        <h1 className="text-2xl font-bold text-center flex-1">Checkout</h1>
        <div className="w-12"></div> {/* Spacer for centering */}
      </div>

      {/* ORDER SUMMARY */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4">
        <h2 className="text-sm font-bold text-gray-500 uppercase mb-3">
          Order Summary {isBulkCheckout && allOrders.length > 1 && `(${allOrders.length} orders)`}
        </h2>
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {allItems.map((item: any, index: number) => (
            <div key={`${item.id}-${index}`} className="flex justify-between text-sm">
              <span>{item.quantity}x {item.item_name}</span>
              <span>AED {Number(item.price).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-gray-200 pt-2 space-y-1">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>AED {subtotal.toFixed(2)}</span>
          </div>
          {/* VAT/Service Charge Placeholders if data available */}
          <div className="flex justify-between text-lg font-bold text-gray-900 mt-2">
            <span>Total</span>
            <span>AED {finalTotal}</span>
          </div>
        </div>
      </div>

      {/* TIP SECTION */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 transition-all duration-300">
        <h2 className="text-lg font-semibold mb-3 text-blue-600 flex items-center gap-2">
          Add a Tip for the Staff 💛 <span className="text-xs text-gray-400 font-normal">(Optional)</span>
        </h2>

        {/* Presets */}
        <div className="flex gap-2 mb-4">
          {[5, 10, 15].map((pct) => (
            <button
              key={pct}
              onClick={() => handlePresetTip(pct)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 border
                        ${tipType === 'percentage' && tipValue === pct
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
            >
              {pct}%
            </button>
          ))}
          <button
            onClick={() => { setTipType('custom_amount'); setTipValue(''); setCustomInput(''); setTipAmount(0); }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 border
                    ${(tipType === 'custom_amount' || tipType === 'custom_percentage')
                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
          >
            Custom
          </button>
        </div>

        {/* Custom Input */}
        {(tipType === 'custom_amount' || tipType === 'custom_percentage') && (
          <div className="mb-4 animate-in fade-in slide-in-from-top-1">
            <label className="block text-xs text-gray-500 mb-1">Enter amount or % (e.g. 10 or 10%)</label>
            <input
              type="text"
              value={customInput}
              onChange={(e) => handleCustomInput(e.target.value)}
              placeholder="AED 0.00"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 font-semibold text-gray-800"
            />
            {(customInput && tipAmount === 0 && customInput !== '') && (
              <p className="text-xs text-red-500 mt-1">Invalid amount (Max 50% of subtotal)</p>
            )}
          </div>
        )}

        {/* Live Tip Display */}
        {tipAmount > 0 && (
          <div className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
            <span className="text-sm font-medium text-blue-800">Tip Added</span>
            <span className="text-lg font-bold text-blue-900">AED {tipAmount.toFixed(2)}</span>
          </div>
        )}
      </div>

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
        <div className="mb-4 flex justify-between items-center px-2">
          <span className="text-gray-500 font-medium">Grand Total</span>
          <span className="text-2xl font-bold text-gray-900">AED {finalTotal}</span>
        </div>

        <CheckoutButton
          orderId={orderId}
          provider={paymentMethod === 'card' ? undefined : 'cash'}
          tipAmount={tipAmount}
          tipType={tipType}
          tipValue={tipValue}
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
