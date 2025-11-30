import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { useEffect, useState } from "react";
import axiosInstance from "../lib/axios";
import { useCart } from "../context/CartContext";
import toast from "react-hot-toast";
import { motion } from "motion/react";

interface ModalProps {
  isOpen: boolean;
  close: () => void;
}
interface ModalFoodDetailProps extends ModalProps {
  isOpen: boolean;
  close: () => void;
  itemId?: number;
  onAddToCart?: () => void;
}

export const ModalFoodDetail: React.FC<ModalFoodDetailProps> = ({
  isOpen,
  close,
  itemId,
  onAddToCart,
}) => {
  const [item, setItem] = useState<any>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();

  const truncatedName =
    item?.item_name?.length > 40
      ? item.item_name.substring(0, 40) + "..."
      : item?.item_name || "Loading...";

  useEffect(() => {
    if (isOpen && itemId) {
      axiosInstance.get(`/customer/items/${itemId}/`).then((res) => {
        setItem(res.data);
        setShowVideo(false);
        setQuantity(1);
      });
    } else {
      setItem(null);
      setShowVideo(false);
      setQuantity(1);
    }
  }, [isOpen, itemId]);

  const handleAddToCart = () => {
    if (item) {
      addToCart(item, quantity);
      toast.success(`Added ${quantity} to cart!`);
      close();
      if (onAddToCart) onAddToCart();
    }
  };

  return (
    <Dialog open={isOpen} onClose={() => close()} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-md transition-opacity duration-300" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="bg-white p-0 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden relative flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
          {/* Close Button */}
          <button
            onClick={close}
            className="absolute top-4 right-4 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full p-2 transition-colors backdrop-blur-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          {/* Media Header */}
          <div className="relative w-full h-72 shrink-0 bg-gray-100">
            {showVideo && item?.video ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full"
              >
                <video
                  src={item.video}
                  controls
                  autoPlay
                  className="w-full h-full object-cover"
                  onClick={(e) => e.stopPropagation()}
                />
              </motion.div>
            ) : (
              <>
                <img
                  src={item?.image1 || "/placeholder-food.jpg"}
                  alt={item?.item_name || "img"}
                  className="w-full h-full object-cover"
                />
                {item?.video && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/50 shadow-xl"
                    onClick={() => setShowVideo(true)}
                  >
                    <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center pl-1 shadow-lg">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 5V19L19 12L8 5Z" />
                      </svg>
                    </div>
                  </motion.button>
                )}
              </>
            )}
            {/* Gradient Overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />
          </div>

          {/* Content Container */}
          <div className="px-6 pb-24 flex flex-col flex-1 overflow-y-auto -mt-6 relative z-10">
            <div className="flex justify-between items-start gap-2 mb-1">
              <h3 className="text-2xl font-bold text-gray-900 leading-tight">
                {truncatedName}
              </h3>
            </div>

            <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
              <span className="flex items-center gap-1 text-yellow-500 font-bold bg-yellow-50 px-2 py-0.5 rounded-md">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                4.8
              </span>
              <span className="flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                20-30 min
              </span>
            </div>

            <p className="text-sm text-gray-500 leading-relaxed">
              {item?.description || "No description available."}
            </p>
          </div>

          {/* Sticky Action Bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
            <div className="flex items-center gap-4">
              {/* Quantity Controls */}
              <div className="flex items-center bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-white rounded-lg transition-colors font-bold text-lg"
                >
                  -
                </button>
                <span className="w-8 text-center font-bold text-gray-900">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-white rounded-lg transition-colors font-bold text-lg"
                >
                  +
                </button>
              </div>

              {/* Add Button */}
              <button
                onClick={handleAddToCart}
                className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-between transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
              >
                <span>Add to Order</span>
                <span className="bg-white/20 px-2 py-0.5 rounded text-sm">
                  AED {(Number(item?.price || 0) * quantity).toFixed(2)}
                </span>
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

interface ModalAssistanceProps extends ModalProps {
  confirm: () => void;
  tableName?: string;
}

export const ModalAssistance: React.FC<ModalAssistanceProps> = ({
  isOpen,
  close,
  confirm,
  tableName,
}) => {
  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 13v6" />
                <path d="M12 17h.01" />
              </svg>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Need assistance?
            </h3>
            <p className="text-gray-500 text-sm mb-1">
              Do you want a staff member to come to your table?
            </p>
            {tableName && (
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-6">
                Table {tableName}
              </p>
            )}

            <div className="flex gap-3 w-full">
              <button
                onClick={close}
                className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                className="flex-1 py-3 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                Confirm
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
