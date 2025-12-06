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

  const truncatedName = item?.item_name || "Loading...";

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
      <div className="fixed inset-0 flex w-screen items-center justify-center p-0 sm:p-4">
        <DialogPanel className="bg-white p-0 rounded-none sm:rounded-[2rem] shadow-2xl w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-lg overflow-hidden relative flex flex-col animate-in zoom-in-95 duration-200">

          {/* Hero Media Area */}
          <div className="relative w-full h-72 shrink-0 bg-black">
            {/* Close Button */}
            <button
              onClick={close}
              className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/40 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            {showVideo && item?.video ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full relative"
              >
                <video
                  src={item.video}
                  controls
                  autoPlay
                  className="w-full h-full object-cover"
                  onClick={(e) => e.stopPropagation()}
                />
                {/* Video Controls Overlay (when playing) - simplified for native controls */}
              </motion.div>
            ) : (
              <>
                <img
                  src={getImageUrl(item?.image1)}
                  alt={item?.item_name || "Food Item"}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    // Show a fallback div if image fails
                    e.currentTarget.parentElement?.querySelector('.fallback-placeholder')?.classList.remove('hidden');
                  }}
                />
                {/* Fallback Div (Hidden by default, shown on error) */}
                <div className="fallback-placeholder hidden absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400">
                  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>

                {/* Video Play Button Overlay */}
                {item?.video && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-16 h-16 bg-white/20 border border-white/50 backdrop-blur-md rounded-full flex items-center justify-center"
                      onClick={() => setShowVideo(true)}
                    >
                      <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-white border-b-[10px] border-b-transparent ml-1" />
                    </motion.button>
                  </div>
                )}
              </>
            )}
            {/* Gradient Overlay for text readability if needed, though design says -mt-4 pulls white card up */}
          </div>

          {/* Content Body */}
          <div className="flex-1 flex flex-col px-6 pt-6 pb-24 overflow-y-auto">
            <div className="flex flex-col items-center text-center space-y-4">
              <h3 className="text-3xl font-bold text-foreground tracking-tight leading-tight">
                {truncatedName}
              </h3>

              {/* Meta Info Row */}
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-medium">
                  Popular
                </span>
                <span className="w-1 h-1 bg-gray-300 rounded-full" />
                <span className="flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  20-30 min
                </span>
              </div>

              <p className="text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
                {item?.description || "No description available for this item."}
              </p>
            </div>
          </div>

          {/* Sticky Action Bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-50 p-4 pt-4 z-30 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center gap-3">
              {/* Quantity Selector */}
              <div className="flex items-center bg-gray-50 p-1.5 rounded-full border border-gray-100">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-12 flex items-center justify-center bg-white text-gray-600 rounded-full shadow-sm hover:bg-gray-50 transition-colors active:scale-95"
                >
                  <span className="text-xl font-bold mb-1">-</span>
                </button>
                <span className="w-12 text-center font-bold text-xl tabular-nums text-foreground">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-12 h-12 flex items-center justify-center bg-foreground text-background rounded-full shadow-md hover:bg-black/90 transition-colors active:scale-95"
                >
                  <span className="text-xl font-bold mb-1">+</span>
                </button>
              </div>

              {/* Add to Cart Button */}
              <button
                onClick={handleAddToCart}
                className="flex-1 h-16 bg-primary hover:bg-primary/90 text-white font-bold rounded-full flex items-center justify-between px-6 transition-all active:scale-[0.98] shadow-xl shadow-primary/20"
              >
                <span className="text-base">Add to Cart</span>
                <span className="text-base bg-white/20 px-3 py-1 rounded-lg">
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
