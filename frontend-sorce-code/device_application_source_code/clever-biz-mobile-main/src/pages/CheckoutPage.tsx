// import { useSearchParams } from "react-router-dom";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import CheckoutButton from "./CheckoutButton";
import { ApplePayButton, GooglePayButton, useWalletAvailability } from "../components/WalletPayment";
import { getRegionConfig } from "../config/regionConfig";
import { cachedGet } from "../lib/requestCache";
// import CheckoutButton from "../components/CheckoutButton";

type SplitType = "full_bill" | "evenly" | "my_items";

type BillItemSummary = {
  bill_item_id: number;
  item_name: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  paid_amount: string;
  unpaid_amount: string;
  paid_quantity: string;
  unpaid_quantity: string;
  item_status: string;
};

type BillSummary = {
  bill_id: number;
  total_amount: string;
  paid_amount: string;
  remaining_amount: string;
  payment_status: string;
  split_method: SplitType | null;
  split_count: number | null;
  per_person_amount: string;
  paid_shares_count: number;
  unpaid_shares_count: number;
  subtotal: string;
  tax_amount: string;
  service_charge: string;
  items: BillItemSummary[];
};

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

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'payme' | 'apple_pay' | 'google_pay'>('card');
  const [orderData, setOrderData] = useState<any>(null);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [billSummary, setBillSummary] = useState<BillSummary | null>(null);
  const [splitType, setSplitType] = useState<SplitType>("full_bill");
  const [splitCount, setSplitCount] = useState<number>(2);
  const [selectedItemQuantities, setSelectedItemQuantities] = useState<Record<number, number>>({});
  const [payerIdOrName, setPayerIdOrName] = useState<string>("");
  const [tipType, setTipType] = useState<'percentage' | 'custom_amount' | 'custom_percentage' | null>(null);
  const [tipValue, setTipValue] = useState<number | string>(''); // 5, 10, 15, or custom input
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [customInput, setCustomInput] = useState<string>('');

  useEffect(() => {
    if (!isBulkCheckout && splitType !== "full_bill") {
      setTipAmount(0);
      setTipType(null);
      setTipValue('');
      setCustomInput('');
    }
  }, [splitType, isBulkCheckout]);

  useEffect(() => {
    if (!isBulkCheckout && splitType !== "full_bill" && ["cash", "apple_pay", "google_pay"].includes(paymentMethod)) {
      setPaymentMethod("card");
    }
  }, [splitType, isBulkCheckout, paymentMethod]);

  const toSafeNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const getRemainingAmount = (order: any): number => {
    const explicit = order?.remaining_amount ?? order?.remainingAmount;
    if (explicit !== undefined && explicit !== null && explicit !== "") {
      return Math.max(0, toSafeNumber(explicit));
    }
    return Math.max(0, toSafeNumber(order?.total_price) - toSafeNumber(order?.amount_paid ?? order?.amountPaid));
  };

  const userInfo = (() => {
    try {
      const raw = localStorage.getItem("userInfo");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const restaurantFromSession = userInfo?.user?.restaurants?.[0] || {};
  const resolvedRegion = (restaurantFromSession.region || orderData?.restaurant_region || "UAE").toUpperCase();
  const regionSettings = getRegionConfig(resolvedRegion);
  const currencyCode = restaurantFromSession.currency || regionSettings.currency;
  const countryAlpha2 = regionSettings.countryAlpha2;
  const isUkRestaurant = resolvedRegion === "UK";

  // Get restaurant ID from order data for wallet availability check
  const restaurantId = orderData?.restaurant || allOrders[0]?.restaurant || null;
  const { availability: walletAvailability, loading: walletLoading } = useWalletAvailability(restaurantId);

  // Fetch Order Data to get Subtotal
  useEffect(() => {
    const guestToken = localStorage.getItem("guest_session_token");

    if (isBulkCheckout && guestToken) {
      // Fetch all unpaid orders for this guest session using correct endpoint
      cachedGet(`/api/customer/uncomplete/orders/`, {
        headers: { "X-Guest-Session-Token": guestToken }
      }, { ttlMs: 1_000 })
        .then(res => {
          const orders = res.data.results || res.data || [];
          // Filter unpaid orders (backend already filters, but double-check)
          const unpaidOrders = Array.isArray(orders) ? orders.filter((o: any) =>
            ['pending', 'preparing', 'served', 'completed', 'delivered'].includes(o.status) &&
            (!o.payment_status || ['unpaid', 'partially_paid', 'pending', 'failed'].includes(o.payment_status))
          ) : [];
          setAllOrders(unpaidOrders);
          // Set orderData to first order for CheckoutButton compatibility
          if (unpaidOrders.length > 0) {
            setOrderData(unpaidOrders[0]);
          }
        })
        .catch(err => console.error("Failed to fetch orders", err));
    } else if (orderId) {
      const guestToken = localStorage.getItem("guest_session_token");
      cachedGet(`/api/customer/uncomplete/orders/${orderId}/`, {
        headers: guestToken ? { "X-Guest-Session-Token": guestToken } : {}
      }, { ttlMs: 1_000 })
        .then(res => {
          setOrderData(res.data);
        })
        .catch(err => console.error("Failed to fetch order", err));
    }
  }, [orderId, isBulkCheckout]);

  useEffect(() => {
    if (isBulkCheckout || !orderId) {
      return;
    }
    const guestToken = localStorage.getItem("guest_session_token");
    if (!guestToken) {
      return;
    }

    cachedGet(`/api/customer/payment/bill-summary/${orderId}/?guest_token=${guestToken}`, {
        headers: {
          "X-Guest-Session-Token": guestToken,
        },
      }, { ttlMs: 1_000 })
      .then((res) => {
        const payload = res.data as BillSummary;
        setBillSummary(payload);
        if (payload.split_method) {
          setSplitType(payload.split_method);
        }
        if (payload.split_count && payload.split_count > 0) {
          setSplitCount(payload.split_count);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch bill summary", err);
      });
  }, [orderId, isBulkCheckout]);

  // Calculate Subtotal - use order.total_price for accuracy
  const subtotal = isBulkCheckout
    ? allOrders.reduce((acc, o) => acc + getRemainingAmount(o), 0)
    : billSummary
      ? toSafeNumber(billSummary.remaining_amount)
      : getRemainingAmount(orderData);

  // Collect all items from all orders for display
  // Backend uses 'order_items' field, fallback to 'items' for compatibility
  const allItems = isBulkCheckout
    ? allOrders.flatMap((o) => (o.order_items || o.items || []).map((item: any) => ({ ...item, orderId: o.id })))
    : (orderData?.order_items || orderData?.items || []);
  const validItems = allItems.filter((item: any) =>
    item &&
    typeof item.item_name === "string" &&
    item.item_name.trim().length > 0 &&
    Number.isFinite(toSafeNumber(item.price)) &&
    toSafeNumber(item.price) >= 0
  );
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

  const billRemaining = toSafeNumber(billSummary?.remaining_amount);
  const splitBaseAmount = isBulkCheckout ? subtotal : (billSummary ? billRemaining : subtotal);
  const tipApplicable = splitType === "full_bill";
  const effectiveTipAmount = tipApplicable ? toSafeNumber(tipAmount) : 0;

  const selectedItems = Object.entries(selectedItemQuantities)
    .filter(([, qty]) => qty > 0)
    .map(([billItemId, qty]) => ({
      bill_item_id: Number(billItemId),
      quantity: qty,
    }));

  const selectedItemsSubtotal = selectedItems.reduce((acc, selected) => {
    const item = billSummary?.items?.find((entry) => entry.bill_item_id === selected.bill_item_id);
    if (!item) return acc;
    const unitPrice = toSafeNumber(item.unit_price);
    const unpaidAmount = toSafeNumber(item.unpaid_amount);
    const lineAmount = Math.min(unitPrice * selected.quantity, unpaidAmount);
    return acc + lineAmount;
  }, 0);

  const billSubtotal = toSafeNumber(billSummary?.subtotal);
  const feesPool = toSafeNumber(billSummary?.tax_amount) + toSafeNumber(billSummary?.service_charge);
  const proportionalFees =
    splitType === "my_items" && billSubtotal > 0
      ? (selectedItemsSubtotal / billSubtotal) * feesPool
      : 0;

  const myItemsTotal = selectedItemsSubtotal + proportionalFees;
  const evenlyTotal = splitCount > 0 ? splitBaseAmount / splitCount : 0;

  const payableAmount = isBulkCheckout
    ? splitBaseAmount + effectiveTipAmount
    : splitType === "my_items"
      ? myItemsTotal
      : splitType === "evenly"
        ? evenlyTotal
        : splitBaseAmount + effectiveTipAmount;

  const finalTotal = payableAmount.toFixed(2);
  const canProceed = splitType !== "my_items" || selectedItems.length > 0;

  const handleWalletSuccess = (result: {
    transactionId?: string;
    fullyPaid?: boolean;
    remainingAmount?: string | number;
  }, paymentMethodName: 'apple_pay' | 'google_pay') => {
    const remaining = toSafeNumber(result.remainingAmount);
    if (result.fullyPaid === false || remaining > 0.001) {
      navigate('/dashboard/orders?payment=partial', { replace: true });
      return;
    }
    navigate(`/dashboard/success/?session_id=${encodeURIComponent(result.transactionId || "")}`, {
      replace: true,
      state: {
        orderId,
        paymentMethod: paymentMethodName,
        transactionId: result.transactionId,
      },
    });
  };

  const updateSelectedItemQuantity = (billItemId: number, maxQty: number, nextValue: string) => {
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSelectedItemQuantities((prev) => {
        const next = { ...prev };
        delete next[billItemId];
        return next;
      });
      return;
    }
    const bounded = Math.min(Math.max(0, parsed), maxQty);
    setSelectedItemQuantities((prev) => ({
      ...prev,
      [billItemId]: bounded,
    }));
  };

  const splitPayload = !isBulkCheckout
    ? {
      split_type: splitType,
      split_count: splitType === "evenly" ? splitCount : undefined,
      selected_items: splitType === "my_items" ? selectedItems : undefined,
      payer_id_or_name: payerIdOrName.trim() || undefined,
      participant: payerIdOrName.trim() || undefined,
    }
    : undefined;

  if (!orderId && !isBulkCheckout) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] p-4 text-center">
        <p className="text-lg font-semibold text-red-500 mb-2">Order ID missing</p>
        <p className="text-gray-500">Redirecting to cart...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 max-w-lg mx-auto w-full shadow-lg">
      {/* 1. FIXED HEADER */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-100 z-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          <span className="text-sm font-medium">Back</span>
        </button>
        <h1 className="text-xl font-bold text-center flex-1 text-gray-900">Checkout</h1>
        <div className="w-12"></div>
      </div>

      {/* 2. SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ORDER SUMMARY */}
        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xs font-bold text-gray-500 uppercase mb-2">
            Order Summary {isBulkCheckout && allOrders.length > 1 && `(${allOrders.length} orders)`}
          </h2>
          <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
            {validItems.map((item: any, index: number) => (
              <div key={`${item.id}-${index}`} className="flex justify-between text-sm">
                <span>{item.quantity}x {item.item_name}</span>
                <span>{currencyCode} {toSafeNumber(item.price).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-gray-200 pt-1 space-y-0.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{currencyCode} {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 mt-1">
              <span>Total</span>
              <span>{currencyCode} {finalTotal}</span>
            </div>
          </div>
        </div>

        {!isBulkCheckout && billSummary && (
          <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Split Bill</h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "full_bill", label: "Full Bill" },
                { key: "evenly", label: "Evenly" },
                { key: "my_items", label: "My Items" },
              ].map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setSplitType(mode.key as SplitType)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold border transition-colors ${
                    splitType === mode.key
                      ? "bg-primary text-white border-primary shadow-sm shadow-primary/20"
                      : "bg-white text-gray-600 border-gray-200 hover:border-primary/40"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded-md p-2">
                <div className="text-gray-500">Paid</div>
                <div className="font-semibold text-gray-900">{currencyCode} {toSafeNumber(billSummary.paid_amount).toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 rounded-md p-2">
                <div className="text-gray-500">Remaining</div>
                <div className="font-semibold text-gray-900">{currencyCode} {toSafeNumber(billSummary.remaining_amount).toFixed(2)}</div>
              </div>
            </div>

            {splitType === "evenly" && (
              <div className="space-y-2">
                <label className="text-xs text-gray-600 block">Split Count</label>
                <input
                  type="number"
                  min={1}
                  value={splitCount}
                  onChange={(e) => setSplitCount(Math.max(1, Number(e.target.value || 1)))}
                  className="w-full p-2 border border-gray-300 rounded-md text-sm"
                />
                <p className="text-xs text-gray-500">
                  Shares paid: {billSummary.paid_shares_count} | Shares remaining: {billSummary.unpaid_shares_count}
                </p>
              </div>
            )}

            {splitType === "my_items" && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {billSummary.items
                  .filter((item) => toSafeNumber(item.unpaid_amount) > 0)
                  .map((item) => {
                    const unpaidQty = Math.max(0, toSafeNumber(item.unpaid_quantity));
                    const selectedQty = selectedItemQuantities[item.bill_item_id] || 0;
                    return (
                      <div key={item.bill_item_id} className="border border-gray-200 rounded-md p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                            <div className="text-xs text-gray-500">
                              Unpaid: {unpaidQty} | {currencyCode} {toSafeNumber(item.unpaid_amount).toFixed(2)}
                            </div>
                          </div>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            max={unpaidQty}
                            value={selectedQty || ""}
                            onChange={(e) => updateSelectedItemQuantity(item.bill_item_id, unpaidQty, e.target.value)}
                            className="w-20 p-1.5 border border-gray-300 rounded-md text-sm"
                            placeholder="Qty"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            <input
              type="text"
              value={payerIdOrName}
              onChange={(e) => setPayerIdOrName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full p-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        )}

        {/* TIP SECTION */}
        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 transition-all duration-300">
          <h2 className="text-base font-semibold mb-2 text-primary flex items-center gap-2">
            Add a Tip for the Staff 💛 <span className="text-xs text-gray-400 font-normal">(Optional)</span>
          </h2>
          {!tipApplicable && !isBulkCheckout && (
            <p className="text-xs text-gray-500 mb-2">
              Tip is available only for Full Bill mode in this version.
            </p>
          )}

          <div className="flex gap-2 mb-2">
            {[5, 10, 15].map((pct) => (
              <button
                key={pct}
                onClick={() => handlePresetTip(pct)}
                disabled={!tipApplicable && !isBulkCheckout}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 border
                          ${tipType === 'percentage' && tipValue === pct
                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/20 transform scale-105'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                  } ${(tipApplicable || isBulkCheckout) ? "" : "opacity-50 cursor-not-allowed"}`}
              >
                {pct}%
              </button>
            ))}
            <button
              onClick={() => { setTipType('custom_amount'); setTipValue(''); setCustomInput(''); setTipAmount(0); }}
              disabled={!tipApplicable && !isBulkCheckout}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 border
                      ${(tipType === 'custom_amount' || tipType === 'custom_percentage')
                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                } ${(tipApplicable || isBulkCheckout) ? "" : "opacity-50 cursor-not-allowed"}`}
            >
              Custom
            </button>
          </div>

          {(tipType === 'custom_amount' || tipType === 'custom_percentage') && (tipApplicable || isBulkCheckout) && (
            <div className="mb-4 animate-in fade-in slide-in-from-top-1">
              <label className="block text-xs text-gray-500 mb-1">Enter amount or % (e.g. 10 or 10%)</label>
              <input
                type="text"
                value={customInput}
                onChange={(e) => handleCustomInput(e.target.value)}
                placeholder={`${currencyCode} 0.00`}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-primary font-semibold text-gray-800"
              />
              {(customInput && tipAmount === 0 && customInput !== '') && (
                <p className="text-xs text-red-500 mt-1">Invalid amount (Max 50% of subtotal)</p>
              )}
            </div>
          )}

          {effectiveTipAmount > 0 && (
            <div className="flex justify-between items-center bg-primary/5 p-3 rounded-lg border border-primary/20">
              <span className="text-sm font-medium text-primary">Tip Added</span>
              <span className="text-lg font-bold text-primary">{currencyCode} {effectiveTipAmount.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* PAYMENT METHOD SELECTION */}
        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold mb-2 text-gray-800">Payment Method</h2>

          <div className="space-y-2">
            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all duration-200
              ${paymentMethod === 'card' ? 'border-primary bg-primary/5 shadow-sm shadow-primary/15' : 'border-gray-200 hover:border-primary/40'}
            `}
            >
              <input
                type="radio"
                name="payment"
                value="card"
                checked={paymentMethod === 'card'}
                onChange={() => setPaymentMethod('card')}
                className="mr-3 h-5 w-5 accent-primary focus:ring-primary"
              />
              <div className="flex-1">
                <span className="font-semibold block text-gray-800">Pay by Card</span>
                <span className="text-sm text-gray-500">Secure online payment</span>
              </div>
              <span className="text-2xl">💳</span>
            </label>

            {isUkRestaurant && (
              <label
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all duration-200
                ${paymentMethod === 'payme' ? 'border-primary bg-primary/5 shadow-sm shadow-primary/15' : 'border-gray-200 hover:border-primary/40'}
              `}
              >
                <input
                  type="radio"
                  name="payment"
                  value="payme"
                  checked={paymentMethod === 'payme'}
                  onChange={() => setPaymentMethod('payme')}
                  className="mr-3 h-5 w-5 accent-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <span className="font-semibold block text-gray-800">Pay by Bank</span>
                  <span className="text-sm text-gray-500">Secure UK open-banking checkout</span>
                </div>
                <span className="text-2xl">🏦</span>
              </label>
            )}

            {/* WALLET PAYMENT OPTIONS */}
            {!walletLoading && (isBulkCheckout || splitType === "full_bill") && (walletAvailability.apple_pay_available || walletAvailability.google_pay_available) && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 uppercase font-medium mb-2">Express Checkout</p>
                <div className="space-y-2">
                  {walletAvailability.apple_pay_available && (
                    <label
                      className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all duration-200
                      ${paymentMethod === 'apple_pay' ? 'border-primary bg-primary/5 shadow-sm shadow-primary/15' : 'border-gray-200 hover:border-primary/40'}
                    `}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="apple_pay"
                        checked={paymentMethod === 'apple_pay'}
                        onChange={() => setPaymentMethod('apple_pay')}
                        className="mr-3 h-5 w-5 accent-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <span className="font-semibold block text-gray-800">Apple Pay</span>
                        <span className="text-sm text-gray-500">Fast & secure</span>
                      </div>
                      <span className="text-2xl"></span>
                    </label>
                  )}
                  {walletAvailability.google_pay_available && (
                    <label
                      className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all duration-200
                      ${paymentMethod === 'google_pay' ? 'border-primary bg-primary/5 shadow-sm shadow-primary/15' : 'border-gray-200 hover:border-primary/40'}
                    `}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="google_pay"
                        checked={paymentMethod === 'google_pay'}
                        onChange={() => setPaymentMethod('google_pay')}
                        className="mr-3 h-5 w-5 accent-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <span className="font-semibold block text-gray-800">Google Pay</span>
                        <span className="text-sm text-gray-500">Fast & secure</span>
                      </div>
                      <span className="text-xl">G Pay</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            <label
              className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all duration-200
              ${paymentMethod === 'cash' ? 'border-primary bg-primary/5 shadow-sm shadow-primary/15' : 'border-gray-200 hover:border-primary/40'}
              ${(!isBulkCheckout && splitType !== 'full_bill') ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            >
              <input
                type="radio"
                name="payment"
                value="cash"
                checked={paymentMethod === 'cash'}
                disabled={!isBulkCheckout && splitType !== 'full_bill'}
                onChange={() => setPaymentMethod('cash')}
                className="mr-3 h-5 w-5 accent-primary focus:ring-primary"
              />
              <div className="flex-1">
                <span className="font-semibold block text-gray-800">Pay by Cash</span>
                <span className="text-sm text-gray-500">Pay directly to staff</span>
              </div>
              <span className="text-2xl">💵</span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. FIXED FOOTER */}
      <div className="bg-white border-t border-gray-200 p-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] w-full">
        <div className="mb-2 flex justify-between items-center px-1">
          <span className="text-gray-500 text-sm font-medium">Grand Total</span>
          <span className="text-2xl font-bold text-gray-900">{currencyCode} {finalTotal}</span>
        </div>

        {/* Card or Cash Payment */}
        {(paymentMethod === 'card' || paymentMethod === 'cash' || paymentMethod === 'payme') && (
          <CheckoutButton
            orderId={orderId}
            disabled={!canProceed}
            provider={
              paymentMethod === 'card'
                ? undefined
                : paymentMethod === 'payme'
                  ? 'payme'
                  : 'cash'
            }
            tipAmount={effectiveTipAmount}
            tipType={tipApplicable ? tipType : null}
            tipValue={tipApplicable ? tipValue : ''}
            isBulkCheckout={isBulkCheckout}
            splitPayload={splitPayload}
          />
        )}

        {/* Apple Pay Button */}
        {paymentMethod === 'apple_pay' && (isBulkCheckout || splitType === "full_bill") && (
          <ApplePayButton
            amount={parseFloat(finalTotal)}
            orderId={orderId}
            restaurantName={orderData?.restaurant_name || 'CleverDining'}
            currencyCode={currencyCode}
            countryCode={countryAlpha2}
            onSuccess={(result) => {
              console.log('Apple Pay Success:', result);
              handleWalletSuccess(result, 'apple_pay');
            }}
            onError={(error) => {
              console.error('Apple Pay Error:', error);
              alert(`Payment failed: ${error}`);
            }}
            onCancel={() => {
              console.log('Apple Pay Cancelled');
            }}
          />
        )}

        {/* Google Pay Button */}
        {paymentMethod === 'google_pay' && (isBulkCheckout || splitType === "full_bill") && (
          <GooglePayButton
            amount={parseFloat(finalTotal)}
            orderId={orderId}
            restaurantName={orderData?.restaurant_name || 'CleverDining'}
            currencyCode={currencyCode}
            countryCode={countryAlpha2}
            onSuccess={(result) => {
              console.log('Google Pay Success:', result);
              handleWalletSuccess(result, 'google_pay');
            }}
            onError={(error) => {
              console.error('Google Pay Error:', error);
              alert(`Payment failed: ${error}`);
            }}
            onCancel={() => {
              console.log('Google Pay Cancelled');
            }}
          />
        )}

        {!canProceed && (
          <p className="text-center text-xs text-red-500 mt-2">
            Select at least one unpaid item to continue.
          </p>
        )}

        {paymentMethod === 'cash' && (
          <p className="text-center text-xs text-gray-500 mt-2">
            A staff member will come to your table.
          </p>
        )}
      </div>
    </div>
  );
}
