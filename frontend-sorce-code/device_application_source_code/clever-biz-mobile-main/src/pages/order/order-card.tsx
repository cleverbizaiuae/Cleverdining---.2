import { cn } from "clsx-for-tailwind";
import { Order, OrderItem, OrderStage } from "./order-types";
import { getSessionCurrencyCode } from "../../utils/regionSession";

interface OrderCardProps {
  order: Order;
}

const steps: Array<{ id: OrderStage; label: string }> = [
  { id: "Pending", label: "Pending" },
  { id: "Preparing", label: "Preparing" },
  { id: "Served", label: "Served" },
];

const normalizeStatus = (status: string | undefined): OrderStage => {
  const value = String(status || "").toLowerCase();
  if (value === "preparing" || value === "cooking") return "Preparing";
  if (
    value === "ready" ||
    value === "served" ||
    value === "completed" ||
    value === "delivered" ||
    value === "cancelled" ||
    value === "awaiting_cash"
  ) {
    return "Served";
  }
  return "Pending";
};

const parseMoney = (value: string | number | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeItems = (order: Order): OrderItem[] => {
  const source = order.items || order.order_items || [];
  if (!Array.isArray(source)) return [];
  return source;
};

export const OrderCard = ({ order }: OrderCardProps) => {
  const currencyCode = getSessionCurrencyCode();
  const normalizedStatus = normalizeStatus(String(order.status));
  const currentStepIndex = steps.findIndex((step) => step.id === normalizedStatus);
  const items = normalizeItems(order);
  const total = parseMoney(order.total ?? order.total_price);
  const orderTime = order.timestamp || order.created_time;

  const fmt = (value: number) => {
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
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 pt-3.5 pb-3 border-b border-gray-50">
        <p className="text-xs text-slate-400 font-medium">
          Ordered at{" "}
          {orderTime
            ? new Date(orderTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "--:--"}
        </p>
      </div>

      <div className="px-4 py-3 space-y-2">
        {items.map((item, idx) => {
          const quantity = Number(item.quantity || 0);
          const itemName = item.name || item.item_name || "Item";
          const lineTotal = parseMoney(item.price) * Math.max(1, quantity);
          return (
            <div key={`${order.id}-${idx}-${itemName}`} className="flex items-center justify-between gap-3">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 flex items-center justify-center shrink-0">
                {Math.max(1, quantity)}
              </span>
              <span className="text-sm text-slate-700 font-medium truncate flex-1">{itemName}</span>
              <span className="text-sm text-slate-500 shrink-0">{fmt(lineTotal)}</span>
            </div>
          );
        })}

        {items.length === 0 && <p className="text-sm text-slate-400">No items in this order.</p>}
      </div>

      <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-gray-50">
        <div className="flex items-center gap-1.5">
          {steps.map((step, idx) => (
            <div
              key={step.id}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                idx <= currentStepIndex ? "bg-[#0055FE]" : "bg-slate-200",
              )}
            />
          ))}
          <span className="text-[11px] text-slate-400 ml-1">{normalizedStatus}</span>
        </div>
        <span className="text-sm font-bold text-slate-900">{fmt(total)}</span>
      </div>
    </div>
  );
};
