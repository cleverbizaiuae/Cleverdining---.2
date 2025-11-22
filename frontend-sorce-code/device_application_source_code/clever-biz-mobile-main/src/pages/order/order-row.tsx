import veg from "@/assets/veg.png";
import ReviewModal from "@/components/ReviewModal";
import { useContext, useState } from "react";
import CheckoutButton from "../CheckoutButton";
import { ProgressBar } from "./order-progressbar";
import { Order, OrderItem } from "./order-types";
import { SocketContext } from "@/components/SocketContext";
import { Check, X } from "lucide-react";

export const OrderRow = ({ order }: { order: Order }) => {
  // Support both order_items and items
  const socket = useContext(SocketContext);
  const response = socket?.response;
  const [hasPaid, setHasPaid] = useState(
    order?.status?.toLowerCase() === "paid"
  );
  const items: OrderItem[] = order.order_items ?? order.items ?? [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleReview = () => {
    setIsModalOpen(true);
  };

  const formatMoney = (v: string | number) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (Number.isFinite(n)) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: "AED",
        }).format(n);
      } catch {
        return `$${n}`;
      }
    }
    return v ?? "—";
  };

  return (
    <>
      <div className="flex flex-col bg-white rounded-xl shadow-sm md:mb-14  xl:mb-8 border border-gray-100   overflow-y-auto  min-h-fit">
        {/* Main Content Container */}
        <div className="p-3 sm:p-4 md:p-6">
          <div className="flex-row custom-scroll lg:flex-row gap-4 lg:gap-6">
            <div className="flex justify-end">
              {hasPaid ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 ring-1 ring-white/20 backdrop-blur-sm">
                  <Check
                    className="h-3.5 w-3.5 drop-shadow-sm"
                    strokeWidth={2.5}
                  />
                  Paid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-slate-500/20 ring-1 ring-white/10 backdrop-blur-sm">
                  <X className="h-3.5 w-3.5 drop-shadow-sm" strokeWidth={2.5} />
                  Unpaid
                </span>
              )}
            </div>
            <div className="flex flex-col xl:flex-row gap-3 sm:gap-4 flex-1 justify-between">
              {/* Image */}
              <div className="flex-shrink-0 flex justify-center items-center md:justify-center">
                <img
                  src={veg}
                  alt="Food"
                  className="w-20 h-20 sm:w-28 sm:h-16 md:w-16 md:h-16 object-cover rounded-lg shadow-sm"
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                {/* Title */}
                <h2 className="font-semibold w-50 text-gray-900 text-base sm:text-lg md:text-xl truncate">
                  {`${items[0]?.item_name}` ||
                    `Order #${order.id}`}
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mt-1">
                  <p className="text-gray-700 font-medium text-sm sm:text-base">
                    Total: {order.total_price}
                  </p>
                  <p className="text-xs sm:text-[12px] text-gray-500 sm:text-right">
                    {new Date(order.created_time).toLocaleString()}
                  </p>
                </div>

                {/* Items List */}
                {items.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
                      Order Items:
                    </p>
                    <ul className="space-y-1">
                      {items.map((it, idx) => (
                        <li
                          key={idx}
                          className="text-xs sm:text-sm text-gray-700 flex flex-wrap gap-1"
                        >
                          <span className="font-medium text-gray-900">
                            {it.item_name.substring(0, 30)}
                          </span>
                          <span className="text-gray-500">× {it.quantity}</span>
                          <span className="text-gray-600 ml-auto">
                            {formatMoney(it.price)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-3 text-xs sm:text-sm text-gray-400 italic">
                    No items in this order.
                  </p>
                )}
              </div>
            </div>

            {/* Right Section: Action Buttons */}
            <div className="flex  gap-4 mt-3">
              {/* Checkout Button */}
              <div className="w-full md:w-2/3 mx-auto">
                <CheckoutButton
                  orderId={order.id}
                  // disabled={
                  //   order.id == response?.order?.id &&
                  //   response?.type === "order_paid"
                  // }
                  disabled={
                    order.status === "paid" || // ✅ permanent check from DB
                    (order.id === response?.order?.id &&
                      response?.type === "order_paid") // ✅ instant live update
                  }
                />
              </div>

              {/* Review Button */}
              <div className="w-full md:w-2/3 mx-auto">
                <button
                  onClick={handleReview}
                  className="w-full px-4 py-2 rounded-md bg-sky-500 text-white hover:bg-green-700 disabled:opacity-60 transition-colors duration-300 ease-in-out"
                  aria-label="Write a review for this order"
                >
                  Review
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 bg-gray-50 px-3 py-4 sm:px-4 sm:py-5">
          <ProgressBar
            status={order.status}
            setHasPaid={setHasPaid}
            hasPaid={hasPaid}
          />
        </div>
      </div>

      {/* Review Modal */}
      <ReviewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        orderId={order.id}
      />
    </>
  );
};

// <style>{`
//     .custom-scroll::-webkit-scrollbar {
//       width: 8px; /* Increase width for better visibility */
//     }
//     .custom-scroll::-webkit-scrollbar-track {
//       background: #f0f0f0; /* Light gray background for the track */
//     }
//     .custom-scroll::-webkit-scrollbar-thumb {
//       background: #ffffff; /* White color for the thumb */
//       border-radius: 4px; /* Slightly rounded corners for the thumb */
//       border: 2px solid #e0e0e0; /* Light border to make the thumb visible */
//     }
//     .custom-scroll::-webkit-scrollbar-thumb:hover {
//       background: #e0e0e0; /* Lighter gray thumb on hover for visibility */
//     }
//   `}</style>
