import { cn } from "clsx-for-tailwind";
import { Order, OrderItem, OrderStage } from "./order-types";
import { mapOrderStatusToStage } from "./order-status";
import { getSessionCurrencyCode } from "../../utils/regionSession";

interface OrderCardProps {
  order: Order;
  isNew?: boolean;
  isCashPending?: boolean;
}

const steps: Array<{ id: OrderStage; label: string }> = [
  { id: "Pending", label: "Pending" },
  { id: "Preparing", label: "Preparing" },
  { id: "Served", label: "Served" },
];

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

export const OrderCard = ({ order, isNew = false, isCashPending = false }: OrderCardProps) => {
  const currencyCode = getSessionCurrencyCode();
  const normalizedStatus = mapOrderStatusToStage(String(order.status));
  const backendStatus = String(order.backendStatus || order.status || "").toLowerCase();
  const currentStepIndex = steps.findIndex((step) => step.id === normalizedStatus);
  const items = normalizeItems(order);
  const total = parseMoney(order.total ?? order.total_price);
  const explicitRemaining = parseMoney(order.remaining_amount ?? order.remainingAmount);
  const paidAmount = parseMoney(order.amount_paid ?? order.amountPaid);
  const hasRemainingField = order.remaining_amount !== undefined || order.remainingAmount !== undefined;
  const remainingAmount = hasRemainingField ? explicitRemaining : Math.max(0, total - paidAmount);
  const resolvedPaidAmount = paidAmount > 0 ? paidAmount : Math.max(0, total - remainingAmount);
  const isFullyPaid = order.is_fully_paid === true || order.isFullyPaid === true || order.paymentStatus === "Paid";
  const isPartiallyPaid =
    order.is_partially_paid === true ||
    order.isPartiallyPaid === true ||
    (!isFullyPaid && resolvedPaidAmount > 0.001);
  const paymentProgress = total > 0 ? Math.min(100, Math.max(0, (resolvedPaidAmount / total) * 100)) : 0;
  const orderTime = order.timestamp || order.created_time;
  const statusMeta =
    backendStatus === "cancelled" || backendStatus === "canceled"
      ? { icon: "✕", label: "Cancelled" }
      : normalizedStatus === "Pending"
      ? { icon: "⏳", label: "Pending" }
      : normalizedStatus === "Preparing"
        ? { icon: "👨‍🍳", label: "Preparing" }
        : {
            icon: "✅",
            label: backendStatus === "delivered" || backendStatus === "completed" ? "Delivered" : "Served",
          };

  const relativeTime = (value: string | undefined) => {
    if (!value) return "--";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "--";
    const diffMs = Date.now() - parsed.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} hr ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  };

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
    <div className={cn("bg-card rounded-2xl shadow-[0_16px_36px_rgba(0,0,0,0.18)] border overflow-hidden transition-colors duration-700", isNew ? "border-primary shadow-primary/20" : "border-border")}>
      <div className="px-4 pt-3.5 pb-3 border-b border-border">
        <p className="text-xs text-muted-foreground font-medium">Ordered {relativeTime(orderTime)}</p>
      </div>

      <div className="px-4 py-3 space-y-2">
        {items.map((item, idx) => {
          const quantity = Number(item.quantity || 0);
          const itemName = item.name || item.item_name || "Item";
          const lineTotal = parseMoney(item.price) * Math.max(1, quantity);
          return (
            <div key={`${order.id}-${idx}-${itemName}`} className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0",
                  Math.max(1, quantity) > 1 ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground",
                )}
              >
                {Math.max(1, quantity)}
              </span>
              <span className="text-sm text-foreground font-medium truncate flex-1">{itemName}</span>
              <span className="text-sm text-muted-foreground shrink-0">{fmt(lineTotal)}</span>
            </div>
          );
        })}

        {items.length === 0 && <p className="text-sm text-muted-foreground">No items in this order.</p>}

        {(isPartiallyPaid || resolvedPaidAmount > 0.001) && !isCashPending && (
          <div className="rounded-xl border border-primary/10 bg-primary/5 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-primary">{isFullyPaid ? "Paid" : "Partially paid"}</span>
              <span className="text-muted-foreground">
                {fmt(resolvedPaidAmount)} paid · {fmt(remainingAmount)} left
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${paymentProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      {isCashPending && (
        <div className="flex items-center gap-2.5 border-t border-blue-100 bg-blue-50 px-4 py-2.5">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#0055FE]" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#0055FE]">Staff will collect your cash payment</p>
            <p className="mt-0.5 text-[10px] text-blue-400">Please stay seated — staff will come to you</p>
          </div>
          <span className="ml-auto shrink-0 text-xs font-bold text-[#0055FE]">
            {fmt(remainingAmount > 0.001 ? remainingAmount : total)}
          </span>
        </div>
      )}

      <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-border">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            {steps.map((step, idx) => {
              const reached = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div key={step.id} className="flex items-center">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      reached ? "bg-primary" : "bg-muted",
                      isCurrent ? "ring-2 ring-primary/20 animate-pulse" : "",
                    )}
                  />
                  {idx < steps.length - 1 && (
                    <span className={cn("w-5 h-[2px] mx-1", idx < currentStepIndex ? "bg-primary" : "bg-muted")} />
                  )}
                </div>
              );
            })}
          </div>
          <span className="text-[11px] text-muted-foreground ml-1">
            {statusMeta.icon} {statusMeta.label}
          </span>
        </div>
        <span className="text-sm font-bold text-foreground">{fmt(total)}</span>
      </div>
    </div>
  );
};
