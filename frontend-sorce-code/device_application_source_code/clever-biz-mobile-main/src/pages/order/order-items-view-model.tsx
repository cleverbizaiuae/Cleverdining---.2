import { DollarSign, Hash, Package, ShoppingCart, X } from "lucide-react";

export interface TOrderItem {
  item_id: number;
  item_name: string;
  image: string;
  price: string;
  quantity: number;
}

interface OrderItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: TOrderItem | null;
  formatMoney?: (value: string | number) => string | number;
}

export default function OrderItemModal({
  isOpen,
  onClose,
  item,
  formatMoney = (v) => `$${v}`,
}: OrderItemModalProps) {
  if (!isOpen || !item) return null;

  const subtotal = parseFloat(item.price) * item.quantity;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative bg-gradient-to-br from-[#C79C44] to-[#B88A3A] p-6">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white transition-all hover:rotate-90 duration-300"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-white">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Item Details</h2>
                <p className="text-white/80 text-sm">Order item information</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {/* Image Section */}
            <div className="mb-6">
              <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-video group">
                <img
                  src={item.image}
                  alt={item.item_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => {
                    e.currentTarget.src =
                      "https://via.placeholder.com/600x400?text=No+Image";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Item Name */}
            <div className="mb-6">
              <h3 className="text-3xl font-bold text-gray-900 mb-2">
                {item.item_name}
              </h3>
              <div className="h-1 w-20 bg-gradient-to-r from-[#C79C44] to-[#B88A3A] rounded-full" />
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Item ID */}
              <div className="group relative overflow-hidden rounded-xl border-2 border-gray-200 p-4 hover:border-[#C79C44]/30 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#C79C44] to-[#B88A3A] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-[#C79C44]/10 transition-colors">
                    <Hash className="w-5 h-5 text-gray-600 group-hover:text-[#C79C44]" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                      Item ID
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      {item?.item_id}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quantity */}
              <div className="group relative overflow-hidden rounded-xl border-2 border-gray-200 p-4 hover:border-[#C79C44]/30 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#C79C44] to-[#B88A3A] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-[#C79C44]/10 transition-colors">
                    <ShoppingCart className="w-5 h-5 text-gray-600 group-hover:text-[#C79C44]" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                      Quantity
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      {item?.quantity}
                    </p>
                  </div>
                </div>
              </div>

              {/* Unit Price */}
              <div className="group relative overflow-hidden rounded-xl border-2 border-gray-200 p-4 hover:border-[#C79C44]/30 transition-all">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#C79C44] to-[#B88A3A] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-[#C79C44]/10 transition-colors">
                    <DollarSign className="w-5 h-5 text-gray-600 group-hover:text-[#C79C44]" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                      Unit Price
                    </p>
                    <p className="text-lg font-bold text-[#C79C44]">
                      {formatMoney(item?.price)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Subtotal */}
              <div className="group relative overflow-hidden rounded-xl border-2 border-[#C79C44] bg-gradient-to-br from-[#C79C44]/5 to-[#B88A3A]/5 p-4">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#C79C44] to-[#B88A3A]" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#C79C44]/20 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-[#C79C44]" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-700 uppercase tracking-wide font-semibold">
                      Subtotal
                    </p>
                    <p className="text-xl font-bold text-[#C79C44]">
                      {formatMoney(subtotal)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="rounded-xl bg-gray-50 p-4 border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                Price Breakdown
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Unit Price</span>
                  <span className="font-semibold text-gray-900">
                    {formatMoney(item.price)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Quantity</span>
                  <span className="font-semibold text-gray-900">
                    × {item.quantity}
                  </span>
                </div>
                <div className="h-px bg-gray-300 my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">
                    Total
                  </span>
                  <span className="text-xl font-bold text-[#C79C44]">
                    {formatMoney(subtotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <button
              onClick={onClose}
              className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-[#C79C44] to-[#B88A3A] text-white font-semibold hover:shadow-lg hover:shadow-[#C79C44]/30 transition-all duration-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
