import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Order, OrderItem, OrderStage } from "./order-types";
import { OrderCard } from "./order-card";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import {
  ArrowRight,
  Gift,
  X,
  Minus,
  Plus,
  Zap,
  Receipt,
  CheckCircle,
  CreditCard,
  Banknote,
  Check,
  UtensilsCrossed,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { getSessionCurrencyCode } from "@/utils/regionSession";
import { AnimatePresence, motion } from "motion/react";

type BackendOrderItem = {
  id?: number;
  item_id?: number;
  item_name?: string;
  quantity?: number;
  price?: number | string;
};

type BackendOrder = {
  id: number;
  order_items?: BackendOrderItem[];
  items?: BackendOrderItem[];
  total_price?: number | string;
  status?: string;
  payment_status?: string;
  created_time?: string;
  device_name?: string;
};

type SplitMode = "none" | "count" | "items";
type TipOption = "none" | "10" | "15" | "20" | "custom";
type PaymentMethod = "cash" | "card" | "googlepay";

type TreatPayload = {
  name: string;
  ts: number;
};

type FlatOrderItem = {
  key: string;
  orderId: string;
  backendOrderId?: string;
  name: string;
  quantity: number;
  price: number;
  lineTotal: number;
};

type ChwaziPhase = "intro" | "waiting" | "counting" | "chosen";

type ChwaziPointer = {
  id: number;
  x: number;
  y: number;
  color: string;
};

const CHWAZI_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#14b8a6", "#ec4899", "#eab308"];
const CHWAZI_COLOR_NAMES: Record<string, string> = {
  "#ef4444": "Red",
  "#22c55e": "Green",
  "#3b82f6": "Blue",
  "#a855f7": "Purple",
  "#f97316": "Orange",
  "#14b8a6": "Teal",
  "#ec4899": "Pink",
  "#eab308": "Yellow",
};

const SECTION_LABEL_CLASS = "text-[11px] font-bold text-slate-400 uppercase tracking-widest";

const getTableInfo = (): { tableNumber: string; tableLabel: string; deviceId: string | null } => {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return { tableNumber: "default", tableLabel: "Table", deviceId: null };

    const parsed = JSON.parse(raw);
    const restaurant = parsed?.user?.restaurants?.[0] || {};

    const tableName = String(restaurant?.table_name || parsed?.table_name || "").trim();
    const deviceId = String(
      restaurant?.device_id || parsed?.table_id || parsed?.device_id || parsed?.user?.device_id || "",
    ).trim();

    const tableNumber = tableName || deviceId || "default";
    const tableLabel = tableName || (deviceId ? `Table ${deviceId}` : "Table");

    return {
      tableNumber,
      tableLabel,
      deviceId: deviceId || null,
    };
  } catch {
    return { tableNumber: "default", tableLabel: "Table", deviceId: null };
  }
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const mapBackendStatus = (status: string): OrderStage => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "preparing" || normalized === "cooking") return "Preparing";
  if (
    normalized === "ready" ||
    normalized === "served" ||
    normalized === "delivered" ||
    normalized === "cancelled" ||
    normalized === "completed" ||
    normalized === "awaiting_cash"
  ) {
    return "Served";
  }
  return "Pending";
};

const mapBackendOrder = (backendOrder: BackendOrder): Order => {
  const sourceItems = backendOrder.order_items || backendOrder.items || [];
  const items: OrderItem[] = sourceItems.map((item, index) => ({
    id: item.id || item.item_id || `${backendOrder.id}-${index}`,
    item_id: item.item_id,
    item_name: item.item_name || "Item",
    name: item.item_name || "Item",
    quantity: Math.max(1, Number(item.quantity || 1)),
    price: toNumber(item.price),
  }));

  return {
    id: `local-${backendOrder.id}`,
    backendId: String(backendOrder.id),
    items,
    total: toNumber(backendOrder.total_price),
    total_price: toNumber(backendOrder.total_price),
    status: mapBackendStatus(String(backendOrder.status || "pending")),
    paymentStatus: String(backendOrder.payment_status || "unpaid").toLowerCase() === "paid" ? "Paid" : "Unpaid",
    payment_status: backendOrder.payment_status || "unpaid",
    timestamp: backendOrder.created_time || new Date().toISOString(),
    created_time: backendOrder.created_time,
    device_name: backendOrder.device_name,
  };
};

const readStoredOrders = (storageKey: string): Order[] => {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
};

const readStoredTreat = (treatKey: string): TreatPayload | null => {
  try {
    const raw = localStorage.getItem(treatKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.name) return parsed;
    return null;
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { response?: { data?: { error?: string; detail?: string } }; message?: string };
    return candidate.response?.data?.error || candidate.response?.data?.detail || candidate.message || "Something went wrong";
  }
  return "Something went wrong";
};

const ScreenOrders = () => {
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const currencyCode = getSessionCurrencyCode();

  const tableInfo = useMemo(() => getTableInfo(), []);
  const ordersStorageKey = useMemo(() => `cleverbiz_orders_table_${tableInfo.tableNumber}`, [tableInfo.tableNumber]);
  const treatKey = useMemo(() => `cb_treat_table_${tableInfo.tableNumber}`, [tableInfo.tableNumber]);

  const [orders, setOrders] = useState<Order[]>(() => readStoredOrders(ordersStorageKey));
  const [loading, setLoading] = useState(orders.length === 0);
  const [err, setErr] = useState<string | null>(null);

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>("none");
  const [splitCount, setSplitCount] = useState(2);
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [tipType, setTipType] = useState<TipOption>("none");
  const [customTipInput, setCustomTipInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);

  const [treat, setTreat] = useState<TreatPayload | null>(() => readStoredTreat(treatKey));

  const [isChwaziOpen, setIsChwaziOpen] = useState(false);
  const [chwaziPhase, setChwaziPhase] = useState<ChwaziPhase>("intro");
  const [chwaziCountdown, setChwaziCountdown] = useState(3);
  const [chwaziPoints, setChwaziPoints] = useState<ChwaziPointer[]>([]);
  const [chosenPointerId, setChosenPointerId] = useState<number | null>(null);
  const hasActiveBackendOrdersRef = useRef(false);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<Set<string>>(new Set());

  const chwaziPointersRef = useRef<Map<number, ChwaziPointer>>(new Map());
  const chwaziIntervalRef = useRef<number | null>(null);
  const chwaziResolveRef = useRef<number | null>(null);

  const fmt = useCallback(
    (value: number) => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currencyCode,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);
      } catch {
        return `${currencyCode} ${value.toFixed(2)}`;
      }
    },
    [currencyCode],
  );

  const clearTreat = useCallback(() => {
    localStorage.removeItem(treatKey);
    setTreat(null);
  }, [treatKey]);

  const setTreater = useCallback(
    (name: string) => {
      const value = { name, ts: Date.now() };
      localStorage.setItem(treatKey, JSON.stringify(value));
      setTreat(value);
      toast.success(`${name} pays for everyone 🎉`);
    },
    [treatKey],
  );

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === treatKey) {
        setTreat(readStoredTreat(treatKey));
      }
      if (event.key === ordersStorageKey && event.newValue) {
        setOrders(readStoredOrders(ordersStorageKey));
      }
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [ordersStorageKey, treatKey]);

  useEffect(() => {
    localStorage.setItem(ordersStorageKey, JSON.stringify(orders));
  }, [orders, ordersStorageKey]);

  useEffect(() => {
    hasActiveBackendOrdersRef.current = orders.some((order) => Boolean(order.backendId));
  }, [orders]);

  useEffect(() => {
    const currentIds = new Set(orders.map((order) => String(order.backendId || order.id)));
    const prevIds = knownOrderIdsRef.current;
    const newIds: string[] = [];
    currentIds.forEach((id) => {
      if (prevIds.size > 0 && !prevIds.has(id)) {
        newIds.push(id);
      }
    });

    if (newIds.length) {
      setHighlightedOrderIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.add(id));
        return next;
      });
      const timer = window.setTimeout(() => {
        setHighlightedOrderIds((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 2000);
      knownOrderIdsRef.current = currentIds;
      return () => window.clearTimeout(timer);
    }

    knownOrderIdsRef.current = currentIds;
  }, [orders]);

  const syncOrdersFromBackend = useCallback((backendList: BackendOrder[]) => {
    const mapped = backendList.map(mapBackendOrder);
    const mappedById = new Map(mapped.map((order) => [order.backendId, order]));

    setOrders((previous) => {
      const existingIds = new Set<string>();

      const synced = previous.map((order) => {
        if (!order.backendId) return order;
        const backendOrder = mappedById.get(order.backendId);

        if (!backendOrder) {
          return { ...order, shouldRemove: true };
        }

        existingIds.add(order.backendId);
        return {
          ...order,
          items: backendOrder.items,
          total: backendOrder.total,
          total_price: backendOrder.total_price,
          status: backendOrder.status,
          paymentStatus: backendOrder.paymentStatus,
          payment_status: backendOrder.payment_status,
          timestamp: backendOrder.timestamp,
          created_time: backendOrder.created_time,
          shouldRemove: false,
        };
      });

      const additions = mapped.filter((order) => order.backendId && !existingIds.has(order.backendId));
      return [...additions, ...synced];
    });
  }, []);

  const fetchBackendOrders = useCallback(async () => {
    const guestToken = localStorage.getItem("guest_session_token");
    const response = await axiosInstance.get(`/api/customer/uncomplete/orders/`, {
      headers: guestToken ? { "X-Guest-Session-Token": guestToken } : {},
      params: tableInfo.deviceId ? { device_id: tableInfo.deviceId } : {},
    });

    const payload = response?.data;
    const backendOrders: BackendOrder[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.orders)
          ? payload.orders
          : [];

    syncOrdersFromBackend(backendOrders);
  }, [syncOrdersFromBackend, tableInfo.deviceId]);

  const pollOrderStatus = useCallback(async () => {
    if (!hasActiveBackendOrdersRef.current) {
      return;
    }
    try {
      await fetchBackendOrders();
    } catch {
      // keep current UI state on poll errors
    }
  }, [fetchBackendOrders]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        setLoading(true);
        setErr(null);
        await fetchBackendOrders();
      } catch (error) {
        if (mounted) {
          setErr(getErrorMessage(error));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    const poll = window.setInterval(() => {
      void pollOrderStatus();
    }, 3000);

    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, [fetchBackendOrders, pollOrderStatus]);

  useEffect(() => {
    if (!orders.some((order) => order.shouldRemove)) return;
    const timer = window.setTimeout(() => {
      setOrders((previous) => previous.filter((order) => !order.shouldRemove));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [orders]);

  const allItems = useMemo<FlatOrderItem[]>(() => {
    return orders.flatMap((order) => {
      const orderItems = order.items || order.order_items || [];
      return orderItems.map((item, index) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const price = toNumber(item.price);
        return {
          key: `${order.id}::${index}::${item.name || item.item_name || "item"}`,
          orderId: String(order.id),
          backendOrderId: order.backendId,
          name: item.name || item.item_name || "Item",
          quantity,
          price,
          lineTotal: price * quantity,
        };
      });
    });
  }, [orders]);

  const unpaidOrders = useMemo(() => {
    return orders.filter((order) => order.paymentStatus !== "Paid" && order.backendId);
  }, [orders]);

  const fullSubtotal = useMemo(() => {
    return unpaidOrders.reduce((sum, order) => sum + toNumber(order.total ?? order.total_price), 0);
  }, [unpaidOrders]);

  const myItemsSubtotal = useMemo(() => {
    return allItems
      .filter((item) => selectedItemKeys.has(item.key))
      .reduce((sum, item) => sum + item.lineTotal, 0);
  }, [allItems, selectedItemKeys]);

  const subtotal = splitMode === "items" ? myItemsSubtotal : fullSubtotal;

  const tipAmount = useMemo(() => {
    if (tipType === "none") return 0;
    if (tipType === "custom") return Math.max(0, Number(customTipInput) || 0);
    return (subtotal * Number(tipType)) / 100;
  }, [customTipInput, subtotal, tipType]);

  const grandTotal = subtotal + tipAmount;
  const displayTotal = splitMode === "count" ? grandTotal / Math.max(splitCount, 1) : grandTotal;
  const hasPayableOrders = unpaidOrders.length > 0;

  const chosenPointer = useMemo(
    () => chwaziPoints.find((pointer) => pointer.id === chosenPointerId) || null,
    [chosenPointerId, chwaziPoints],
  );

  const clearChwaziTimers = useCallback(() => {
    if (chwaziIntervalRef.current) {
      window.clearInterval(chwaziIntervalRef.current);
      chwaziIntervalRef.current = null;
    }
    if (chwaziResolveRef.current) {
      window.clearTimeout(chwaziResolveRef.current);
      chwaziResolveRef.current = null;
    }
  }, []);

  const syncChwaziPoints = useCallback(() => {
    const points = Array.from(chwaziPointersRef.current.values());
    setChwaziPoints(points);
    return points;
  }, []);

  const closeChwazi = useCallback(() => {
    clearChwaziTimers();
    chwaziPointersRef.current.clear();
    setChwaziPoints([]);
    setChosenPointerId(null);
    setChwaziCountdown(3);
    setChwaziPhase("intro");
    setIsChwaziOpen(false);
  }, [clearChwaziTimers]);

  const pickChwaziWinner = useCallback(() => {
    const current = Array.from(chwaziPointersRef.current.values());
    if (current.length < 2) {
      setChwaziPhase("waiting");
      return;
    }

    const winner = current[Math.floor(Math.random() * current.length)];
    setChosenPointerId(winner.id);
    setChwaziPhase("chosen");

    chwaziResolveRef.current = window.setTimeout(() => {
      const colorName = CHWAZI_COLOR_NAMES[winner.color] || "Lucky";
      setTreater(colorName);
      closeChwazi();
    }, 2500);
  }, [closeChwazi, setTreater]);

  const startChwaziCountdown = useCallback(() => {
    clearChwaziTimers();
    setChwaziCountdown(3);
    chwaziIntervalRef.current = window.setInterval(() => {
      setChwaziCountdown((previous) => {
        if (previous <= 1) {
          clearChwaziTimers();
          pickChwaziWinner();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  }, [clearChwaziTimers, pickChwaziWinner]);

  useEffect(() => {
    return () => {
      clearChwaziTimers();
    };
  }, [clearChwaziTimers]);

  const handleChwaziPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isChwaziOpen) return;
    if (chwaziPhase === "intro") {
      setChwaziPhase("waiting");
    }

    const color = CHWAZI_COLORS[chwaziPointersRef.current.size % CHWAZI_COLORS.length];
    chwaziPointersRef.current.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      color,
    });

    const points = syncChwaziPoints();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (points.length >= 2 && chwaziPhase !== "counting" && chwaziPhase !== "chosen") {
      setChwaziPhase("counting");
      startChwaziCountdown();
    }
  };

  const handleChwaziPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const existing = chwaziPointersRef.current.get(event.pointerId);
    if (!existing) return;
    chwaziPointersRef.current.set(event.pointerId, {
      ...existing,
      x: event.clientX,
      y: event.clientY,
    });
    syncChwaziPoints();
  };

  const handleChwaziPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    chwaziPointersRef.current.delete(event.pointerId);
    const points = syncChwaziPoints();

    if (points.length < 2) {
      clearChwaziTimers();
      setChwaziPhase("waiting");
      setChwaziCountdown(3);
      setChosenPointerId(null);
    }

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // no-op
    }
  };

  const openChwazi = () => {
    setIsChwaziOpen(true);
    setChwaziPhase("intro");
    setChwaziCountdown(3);
  };

  const toggleItem = (key: string) => {
    setSelectedItemKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const resetCheckoutState = () => {
    setSplitMode("none");
    setSplitCount(2);
    setSelectedItemKeys(new Set());
    setTipType("none");
    setCustomTipInput("");
    setPaymentMethod("card");
    setIsPaymentSuccess(false);
  };

  const openCheckoutDialog = () => {
    if (!hasPayableOrders) {
      toast.error("No unpaid orders available.");
      return;
    }
    setIsCheckoutOpen(true);
    setIsPaymentSuccess(false);
  };

  const clearSession = useCallback(async () => {
    localStorage.removeItem(ordersStorageKey);
    localStorage.removeItem("pending_order_id");
    localStorage.removeItem("bulk_checkout");
    setOrders([]);
    await clearCart();
  }, [clearCart, ordersStorageKey]);

  const buildTipPayload = () => {
    if (tipAmount <= 0) return {};
    if (tipType === "custom") {
      return {
        tip_amount: tipAmount,
        tip_type: "custom_amount",
        tip_value: tipAmount,
      };
    }
    if (tipType === "none") return {};
    return {
      tip_amount: tipAmount,
      tip_type: "percentage",
      tip_value: Number(tipType),
    };
  };

  const resolveProvider = () => {
    if (paymentMethod === "cash") return "cash";
    return undefined;
  };

  const handleCheckoutResponse = async (data: any, isPayingAll: boolean) => {
    const url: string | undefined = data?.url;

    if (url && paymentMethod !== "cash") {
      window.location.href = url;
      return;
    }

    if (isPayingAll) {
      setIsPaymentSuccess(true);
      window.setTimeout(async () => {
        await clearSession();
        clearTreat();
        setIsCheckoutOpen(false);
        navigate("/thankyou");
      }, 2500);
      return;
    }

    setIsCheckoutOpen(false);
    toast.success("Payment confirmed", {
      duration: 3000,
    });
    await pollOrderStatus();
  };

  const processCheckout = async () => {
    if (isProcessingPayment) return;

    if (splitMode === "items" && selectedItemKeys.size === 0) {
      toast.error("Select at least one item for My Items payment.");
      return;
    }

    setIsProcessingPayment(true);

    try {
      const guestToken = localStorage.getItem("guest_session_token");
      if (!guestToken) {
        throw new Error("Session expired. Please scan the table QR again.");
      }

      const provider = resolveProvider();
      const tipPayload = buildTipPayload();

      if (splitMode === "none") {
        const response = await axiosInstance.post(
          `/api/customer/create-bulk-checkout-session/`,
          {
            provider,
            ...tipPayload,
          },
          {
            headers: { "X-Guest-Session-Token": guestToken },
          },
        );

        await handleCheckoutResponse(response.data, true);
        return;
      }

      if (splitMode === "count") {
        const response = await axiosInstance.post(
          `/api/customer/create-bulk-checkout-session/`,
          {
            provider,
            split_count: Math.max(2, splitCount),
            ...tipPayload,
          },
          {
            headers: { "X-Guest-Session-Token": guestToken },
          },
        );

        await handleCheckoutResponse(response.data, true);
        return;
      }

      const selectedItems = allItems.filter((item) => selectedItemKeys.has(item.key));
      const selectedOrderIds = Array.from(new Set(selectedItems.map((item) => item.backendOrderId).filter(Boolean)));

      if (selectedOrderIds.length !== 1) {
        throw new Error("For My Items split, select items from a single order.");
      }

      const targetOrderId = selectedOrderIds[0] as string;
      const billSummaryResponse = await axiosInstance.get(
        `/api/customer/payment/bill-summary/${targetOrderId}/?guest_token=${guestToken}`,
        {
          headers: { "X-Guest-Session-Token": guestToken },
        },
      );

      const billItems = Array.isArray(billSummaryResponse.data?.items) ? billSummaryResponse.data.items : [];
      const selectedByName = selectedItems.reduce<Record<string, number>>((acc, item) => {
        const name = item.name.trim().toLowerCase();
        acc[name] = (acc[name] || 0) + item.quantity;
        return acc;
      }, {});

      const selectedPayload: Array<{ bill_item_id: number; quantity: number }> = [];

      billItems.forEach((billItem: any) => {
        const name = String(billItem?.item_name || "").trim().toLowerCase();
        const requestedQty = selectedByName[name] || 0;
        if (!requestedQty) return;

        const maxQty = Math.max(0, toNumber(billItem?.unpaid_quantity));
        const quantity = Math.min(requestedQty, maxQty);
        if (quantity <= 0) return;

        selectedPayload.push({
          bill_item_id: Number(billItem.bill_item_id),
          quantity,
        });
      });

      if (!selectedPayload.length) {
        throw new Error("Selected items are already paid or unavailable for split payment.");
      }

      const response = await axiosInstance.post(
        `/api/customer/create-checkout-session/${targetOrderId}/?guest_token=${guestToken}`,
        {
          provider,
          split_type: "my_items",
          selected_items: selectedPayload,
        },
        {
          headers: { "X-Guest-Session-Token": guestToken },
        },
      );

      await handleCheckoutResponse(response.data, false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const isAndroid = /Android/i.test(window.navigator.userAgent || "");
  const canPay = splitMode !== "items" || selectedItemKeys.size > 0;

  const totalLabel =
    splitMode === "count" ? `Your share (÷${Math.max(splitCount, 1)})` : splitMode === "items" ? "Your share" : "Total";

  return (
    <div className="fixed inset-0 mb-[80px] bg-gray-50 flex flex-col">
      <div className="bg-white px-5 pt-5 pb-4 shadow-sm z-20 rounded-b-3xl mb-3 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Orders</h1>

          <button
            onClick={openChwazi}
            className="rounded-full px-3 py-1.5 h-auto text-xs font-semibold gap-1.5 bg-slate-900 hover:bg-slate-800 text-white inline-flex items-center"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Wait &amp; Play</span>
          </button>
        </div>

        <AnimatePresence>
          {treat && (
            <motion.div
              initial={{ height: 0, marginTop: 0, opacity: 0 }}
              animate={{ height: "auto", marginTop: 10, opacity: 1 }}
              exit={{ height: 0, marginTop: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-2.5 flex items-center gap-3">
                <Gift className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-green-800 font-semibold text-sm flex-1">{treat.name} is treating everyone! 🎉</span>
                <button onClick={clearTreat} className="text-green-400 hover:text-green-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-2" />
            <p>Loading orders...</p>
          </div>
        )}

        {err && !loading && <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-center">{err}</div>}

        {!loading && !err && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[52vh] text-center">
            <div className="w-24 h-24 rounded-full bg-slate-50 flex items-center justify-center mb-5">
              <UtensilsCrossed className="w-16 h-16 text-slate-200" />
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">Nothing ordered yet</h3>
            <p className="text-slate-400 max-w-[240px] text-sm">Head back to the menu to get started.</p>
            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => navigate("/dashboard")}
                className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-bold inline-flex items-center gap-1.5"
              >
                Browse Menu <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={openChwazi}
                className="h-10 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50"
              >
                Play Games
              </button>
            </div>
          </div>
        )}

        {!loading && !err && orders.length > 0 && (
          <div className="space-y-3 pb-3">
            {orders.map((order) => (
              <motion.div
                key={String(order.id)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                        <OrderCard order={order} isNew={highlightedOrderIds.has(String(order.backendId || order.id))} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {hasPayableOrders && (
        <div className="bg-white border-t border-gray-100 px-4 pt-3 pb-3 shrink-0">
          <button
            onClick={openCheckoutDialog}
            className="w-full h-[52px] rounded-2xl text-base font-bold shadow-lg shadow-primary/20 flex items-center justify-between px-5 py-4 bg-[#0055FE] text-white"
          >
            <span>Pay Now</span>
            <span>{fmt(fullSubtotal)}</span>
          </button>
        </div>
      )}

      <Dialog
        open={isCheckoutOpen}
        onClose={() => {
          if (isProcessingPayment) return;
          setIsCheckoutOpen(false);
          resetCheckoutState();
        }}
        className="relative z-50"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/35" />

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <DialogPanel className="w-[88%] max-w-[360px] bg-white rounded-3xl border-none shadow-2xl p-0 overflow-hidden gap-0 max-h-[92vh] flex flex-col">
              {isPaymentSuccess ? (
                <div className="text-center py-14 space-y-4 px-6">
                  <div className="w-16 h-16 rounded-full border-2 border-green-100 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-green-500" strokeWidth={1.6} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Payment Done!</h2>
                  <p className="text-slate-400 text-sm">Thank you for dining with us</p>
                </div>
              ) : (
                <>
                  <div className="px-5 pt-5 pb-4 border-b border-slate-100 text-center shrink-0 relative">
                    <button
                      onClick={() => {
                        setIsCheckoutOpen(false);
                        resetCheckoutState();
                      }}
                      className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3">
                      <CreditCard className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
                    </div>
                    <DialogTitle className="text-lg font-bold text-slate-900">Checkout</DialogTitle>
                    <p className="text-xs text-slate-400 mt-0.5">{tableInfo.tableLabel}</p>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Orders ({unpaidOrders.length})</span>
                        <span className="text-sm font-semibold text-slate-900">{fmt(subtotal)}</span>
                      </div>

                      {tipAmount > 0 && (
                        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                          <span className="text-sm text-slate-500">Tip</span>
                          <span className="text-sm font-semibold text-slate-700">{fmt(tipAmount)}</span>
                        </div>
                      )}

                      {splitMode === "items" && (
                        <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                          <span className="text-sm text-slate-500">My items subtotal</span>
                          <span className="text-sm font-bold text-primary">{fmt(myItemsSubtotal)}</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <p className={SECTION_LABEL_CLASS}>Split Bill</p>
                      <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
                        {[
                          { id: "none", label: "Full Bill" },
                          { id: "count", label: "Evenly" },
                          { id: "items", label: "My Items" },
                        ].map((mode) => (
                          <button
                            key={mode.id}
                            onClick={() => {
                              setSplitMode(mode.id as SplitMode);
                              if (mode.id !== "items") setSelectedItemKeys(new Set());
                            }}
                            className={`text-xs font-semibold py-1.5 rounded-lg transition-colors ${
                              splitMode === mode.id
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>

                      {splitMode === "count" && (
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-4 gap-1.5">
                            {[2, 3, 4, 5].map((count) => (
                              <button
                                key={count}
                                onClick={() => setSplitCount(count)}
                                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${
                                  splitCount === count
                                    ? "border-primary bg-primary/8 text-primary"
                                    : "border-slate-200 bg-white text-slate-500"
                                }`}
                              >
                                ÷{count}
                              </button>
                            ))}
                          </div>

                          <div className="bg-slate-50 rounded-xl py-2.5 px-4 flex items-center justify-center gap-3">
                            <button
                              onClick={() => setSplitCount((prev) => Math.max(2, prev - 1))}
                              className="w-7 h-7 rounded-full border border-slate-200 bg-white flex items-center justify-center"
                            >
                              <Minus className="w-3 h-3 text-slate-500" strokeWidth={2} />
                            </button>
                            <span className="text-sm font-bold text-slate-700 w-20 text-center">{splitCount} people</span>
                            <button
                              onClick={() => setSplitCount((prev) => prev + 1)}
                              className="w-7 h-7 rounded-full border border-slate-200 bg-white flex items-center justify-center"
                            >
                              <Plus className="w-3 h-3 text-slate-500" strokeWidth={2} />
                            </button>
                          </div>

                          <div className="rounded-xl bg-primary/5 border border-primary/20 py-3 text-center">
                            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Per person</p>
                            <p className="text-2xl font-black text-primary mt-0.5">{fmt(displayTotal)}</p>
                          </div>
                        </div>
                      )}

                      {splitMode === "items" && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-400">Select what you ordered</p>
                          <div className="border border-slate-100 rounded-2xl overflow-hidden">
                            {allItems.map((item, idx) => {
                              const isChecked = selectedItemKeys.has(item.key);
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => toggleItem(item.key)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 text-left ${
                                    idx > 0 ? "border-t border-slate-50" : ""
                                  } ${isChecked ? "bg-primary/5" : "bg-white hover:bg-slate-50"}`}
                                >
                                  <span
                                    className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center ${
                                      isChecked ? "bg-primary border-primary" : "border-slate-300"
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm text-slate-800 font-medium truncate">{item.name}</p>
                                    {item.quantity > 1 && <p className="text-xs text-slate-400">×{item.quantity}</p>}
                                  </div>
                                  <span className={`text-sm font-semibold shrink-0 ${isChecked ? "text-primary" : "text-slate-500"}`}>
                                    {fmt(item.lineTotal)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="sticky bottom-0 bg-white border border-primary/20 rounded-xl px-3 py-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500">Your items</span>
                            <span className="text-sm font-black text-primary">{fmt(myItemsSubtotal)}</span>
                          </div>
                        </div>
                      )}

                      {!treat && splitMode !== "items" && (
                        <button
                          type="button"
                          onClick={openChwazi}
                          className="w-full flex items-center justify-center gap-1.5 py-1 text-slate-400 hover:text-slate-600 text-xs transition-colors"
                        >
                          <Gift className="w-3 h-3" />
                          Play Chwazi — decide who pays
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <p className={SECTION_LABEL_CLASS}>Tip</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { id: "none", label: "None" },
                          { id: "10", label: "10%" },
                          { id: "15", label: "15%" },
                          { id: "20", label: "20%" },
                        ].map((tip) => (
                          <button
                            key={tip.id}
                            onClick={() => setTipType(tip.id as TipOption)}
                            className={`py-2 rounded-xl text-xs font-bold border-2 ${
                              tipType === tip.id
                                ? "border-primary bg-primary/8 text-primary"
                                : "border-slate-200 bg-white text-slate-500"
                            }`}
                          >
                            {tip.id === "none"
                              ? "None"
                              : `${tip.label} (${fmt((subtotal * Number(tip.id)) / 100)})`}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setTipType("custom")}
                        className={`w-full py-2 rounded-xl text-xs font-bold border-2 ${
                          tipType === "custom"
                            ? "border-primary bg-primary/8 text-primary"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        Custom Amount
                      </button>

                      {tipType === "custom" && (
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          autoFocus
                          value={customTipInput}
                          onChange={(event) => setCustomTipInput(event.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-primary/30 bg-primary/5 text-sm font-semibold focus:border-primary focus:outline-none"
                          placeholder="Enter custom amount"
                        />
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <p className={SECTION_LABEL_CLASS}>Payment Method</p>
                      <div className={`grid gap-2 ${isAndroid ? "grid-cols-3" : "grid-cols-2"}`}>
                        {[
                          { id: "card", label: "Card" },
                          { id: "cash", label: "Cash" },
                          ...(isAndroid ? [{ id: "googlepay", label: "G Pay" }] : []),
                        ].map((method) => {
                          const isActive = paymentMethod === method.id;
                          return (
                            <button
                              key={method.id}
                              onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                              className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all ${
                                isActive
                                  ? "border-slate-900 text-slate-900 bg-white"
                                  : "border-slate-200 bg-white text-slate-400"
                              }`}
                            >
                              {method.id === "card" && <CreditCard className="w-5 h-5" strokeWidth={1.8} />}
                              {method.id === "cash" && <Banknote className="w-5 h-5" strokeWidth={1.8} />}
                              {method.id === "googlepay" && (
                                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                                  <path d="M11.99 11.18v2.77h3.93c-.17.98-.7 1.8-1.5 2.35v1.95h2.42c1.41-1.3 2.22-3.2 2.22-5.46 0-.52-.05-1.02-.14-1.5h-6.93ZM11.99 20c2.01 0 3.7-.66 4.93-1.79l-2.42-1.95c-.67.45-1.53.72-2.51.72-1.94 0-3.58-1.31-4.17-3.07H5.34v2.02A8.01 8.01 0 0 0 11.99 20ZM7.82 13.91a4.81 4.81 0 0 1 0-3.06V8.83H5.34a8 8 0 0 0 0 7.1l2.48-2.02ZM11.99 7.02c1.09 0 2.07.37 2.84 1.11l2.13-2.13C15.69 4.82 13.99 4 11.99 4a8.01 8.01 0 0 0-6.65 3.83l2.48 2.02c.59-1.76 2.23-3.07 4.17-3.07Z" />
                                </svg>
                              )}
                              <span className="text-[11px] font-bold">{method.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-4 border-t border-slate-100 bg-white shrink-0 space-y-2.5">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-sm text-slate-500">{totalLabel}</span>
                      <span className="text-xl font-bold text-slate-900">{fmt(displayTotal)}</span>
                    </div>

                    <button
                      onClick={() => void processCheckout()}
                      disabled={isProcessingPayment || !canPay}
                      className="w-full h-12 rounded-2xl text-base font-bold shadow-lg shadow-primary/20 bg-[#0055FE] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessingPayment
                        ? "Processing..."
                        : splitMode === "count"
                          ? `Pay My Share · ${fmt(displayTotal)}`
                          : `Pay Now · ${fmt(displayTotal)}`}
                    </button>

                    <button
                      onClick={() => {
                        setIsCheckoutOpen(false);
                        resetCheckoutState();
                      }}
                      disabled={isProcessingPayment}
                      className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors py-1 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </DialogPanel>
          </div>
        </div>
      </Dialog>

      <AnimatePresence>
        {isChwaziOpen && (
          <motion.div
            className="fixed inset-0 z-[9999] bg-slate-900"
            style={{ touchAction: "none", userSelect: "none" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onPointerDown={handleChwaziPointerDown}
            onPointerMove={handleChwaziPointerMove}
            onPointerUp={handleChwaziPointerUp}
            onPointerCancel={handleChwaziPointerUp}
          >
            <button
              onClick={closeChwazi}
              className="absolute top-5 right-5 z-30 text-white/80 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>

            {chwaziPoints.map((pointer) => (
              <div
                key={pointer.id}
                className="absolute rounded-full"
                style={{
                  width: 96,
                  height: 96,
                  left: pointer.x - 48,
                  top: pointer.y - 48,
                  backgroundColor: pointer.color,
                  boxShadow: `0 0 30px ${pointer.color}88`,
                }}
              />
            ))}

            {chosenPointer && (
              <>
                <div
                  className="absolute rounded-full animate-ping"
                  style={{
                    width: 128,
                    height: 128,
                    left: chosenPointer.x - 64,
                    top: chosenPointer.y - 64,
                    backgroundColor: `${chosenPointer.color}4D`,
                    zIndex: 15,
                  }}
                />
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 128,
                    height: 128,
                    left: chosenPointer.x - 64,
                    top: chosenPointer.y - 64,
                    backgroundColor: chosenPointer.color,
                    boxShadow: `0 0 60px ${chosenPointer.color}`,
                    zIndex: 16,
                  }}
                />
              </>
            )}

            {chosenPointer && (
              <div
                className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center text-center"
                style={{ backgroundColor: chosenPointer.color }}
              >
                <div className="text-8xl">🎉</div>
                <div className="text-5xl font-black text-white">{CHWAZI_COLOR_NAMES[chosenPointer.color] || "Lucky"}</div>
                <div className="text-xl text-white/80 mt-2">Pays for everyone!</div>
              </div>
            )}

            {!chosenPointer && (
              <div className="absolute inset-x-0 top-12 z-20 text-center px-6">
                <p className="text-white text-lg font-semibold">Chwazi</p>
                <p className="text-white/70 text-sm mt-1">Place at least 2 fingers and hold to choose who pays.</p>
                {chwaziPhase === "counting" && (
                  <p className="text-white text-3xl font-black mt-4">{chwaziCountdown}</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ScreenOrders;
