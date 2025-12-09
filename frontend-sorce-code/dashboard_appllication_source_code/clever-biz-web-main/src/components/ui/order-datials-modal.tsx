import { Calendar, CreditCard, Package, X } from "lucide-react";

interface OrderItem {
  item_id: number;
  item_name: string;
  quantity: number;
  price: string;
  image: string;
}

interface Order {
  id: number;
  created_time: string;
  device: number;
  device_name: string;
  order_items: OrderItem[];
  payment_status: string;
  restaurant: number;
  status: string;
  total_price: string;
  updated_time: string;
  payments?: any[];
}

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  formatMoney?: (value: string | number) => string;
}

export default function OrderDetailsModal({
  isOpen,
  onClose,
  order,
  formatMoney = (v) => `AED ${v}`
}: OrderDetailsModalProps) {
  if (!isOpen || !order) return null;
  console.log(order);
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/10  z-40 " onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-gradient-to-br bg-primary rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative p-6 border-b border-white/10">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white transition-all hover:rotate-90"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-white">
              <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Order #{order.id}</h2>
                <p className="text-white/70 text-sm">{order.device_name}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-3">
              {/* Date */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-blue-300" />
                  <span className="text-sm text-white/70">Order Date</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {formatDate(order.created_time)}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-blue-300" />
                  <span className="text-sm text-white/70">Total Amount</span>
                </div>
                <span className="text-xl font-bold text-white">
                  {formatMoney(order.total_price)}
                </span>
              </div>


            </div>

            <div>
              <h3 className="text-white font-semibold mb-3 text-sm uppercase tracking-wide">
                Order Items
              </h3>
              <div className="space-y-2">
                {order.order_items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    {/* Image */}
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src =
                              "https://via.placeholder.com/56?text=No+Image";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-6 h-6 text-white/30" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">
                        {item.item_name}
                      </p>
                      <p className="text-white/50 text-xs">
                        Qty: {item.quantity} × {formatMoney(item.price)}
                      </p>
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      <p className="text-white font-bold">
                        {formatMoney(parseFloat(item.price) * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Details Section */}
            <div className="space-y-3">
              <h3 className="text-white font-semibold text-sm uppercase tracking-wide">
                Payment Details
              </h3>
              {order.payments && order.payments.length > 0 ? (
                order.payments.map((payment: any, idx: number) => (
                  <div key={idx} className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/70">Provider</span>
                      <span className="text-white font-medium capitalize">{payment.provider}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/70">Status</span>
                      <span className={`font-medium capitalize ${payment.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}`}>
                        {payment.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/70">Transaction ID</span>
                      <span className="text-white/90 font-mono text-xs">{payment.transaction_id || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/70">Amount</span>
                      <span className="text-white font-bold">{formatMoney(payment.amount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/70">Date</span>
                      <span className="text-white/70 text-xs">{new Date(payment.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-center">
                  <span className="text-white/50 text-sm">No payment details available</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl border border-white/20">
              <div className="flex items-center justify-between">
                <span className="text-white/90 font-semibold">Order Total</span>
                <span className="text-2xl font-bold text-white">
                  {formatMoney(order.total_price)}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-white/10">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
