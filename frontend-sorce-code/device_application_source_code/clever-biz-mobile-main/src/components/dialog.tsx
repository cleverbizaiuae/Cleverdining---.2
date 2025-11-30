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
      for (let i = 0; i < quantity; i++) {
        addToCart(item);
      }
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
          <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
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

interface ModalConfirm extends ModalProps {
  confirm: () => void;
}
export const ModalCallConfirm: React.FC<ModalConfirm> = ({
  isOpen,
  close,
  confirm,
}) => {
  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/10" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className=" bg-primary/90 p-4 rounded-lg shadow-xl w-full max-w-lg">
          <div className="relative max-h-[300px] mx-auto aspect-square rounded-xl overflow-hidden flex flex-col justify-center items-center">
            <p className="text-lg text-primary-text text-center">
              Do you want to call for assitance?
            </p>
            <div className="mt-8 flex flex-row justify-center items-center gap-x-16">
              <button onClick={() => close()} className="text-primary-text">
                Cancel
              </button>
              <button
                onClick={() => confirm()}
                className="button-primary px-8 py-3 text-primary-text"
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

interface ModalCallProps extends ModalProps {
  onHangUp?: () => void;
}

export const ModalCall: React.FC<ModalCallProps> = ({ isOpen, close, onHangUp }) => {
  return (
    <Dialog
      open={isOpen}
      onClose={() => close()}
      className="relative z-50 transition duration-300 ease-out data-[closed]:opacity-0"
      transition={true}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/10" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className=" bg-primary/90 p-4 rounded-lg shadow-xl w-full max-w-lg">
          <div className="relative max-h-[300px] mx-auto aspect-square rounded-xl overflow-hidden flex flex-col justify-center items-center">
            <div className="flex flex-row gap-x-10">
              <button onClick={close}>
                <svg
                  width="51"
                  height="51"
                  viewBox="0 0 51 51"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="51" height="51" rx="25.5" fill="#1CC06C" />
                  <path
                    d="M29.1485 28.4731L28.6177 29.0331C28.6177 29.0331 27.3542 30.3619 23.9067 26.7324C20.4592 23.1029 21.7227 21.7741 21.7227 21.7741L22.0575 21.4206C22.8812 20.5526 22.9593 19.1596 22.2395 18.1422L20.7695 16.0621C19.8782 14.8021 18.1573 14.6364 17.1365 15.7109L15.306 17.6371C14.8008 18.1702 14.4625 18.8597 14.5033 19.6262C14.6083 21.5862 15.446 25.8014 20.1173 30.7212C25.0722 35.9362 29.7213 36.1439 31.6218 35.9561C32.2238 35.8977 32.7465 35.5722 33.1677 35.1289L34.8243 33.3836C35.9443 32.2052 35.6293 30.1869 34.1967 29.3632L31.9683 28.0799C31.028 27.5397 29.8835 27.6984 29.1485 28.4719M26.4698 13.6937C26.4883 13.5803 26.5289 13.4715 26.5893 13.3738C26.6498 13.276 26.7289 13.1911 26.8222 13.1239C26.9155 13.0567 27.0211 13.0086 27.133 12.9823C27.2449 12.9559 27.3609 12.9519 27.4743 12.9704C27.5035 12.9762 27.5992 12.9937 27.6493 13.0054C27.7497 13.0264 27.8866 13.0614 28.06 13.1104C28.4065 13.2119 28.8907 13.3787 29.4717 13.6447C30.6337 14.1779 32.1795 15.1101 33.7848 16.7142C35.3902 18.3196 36.3223 19.8666 36.8555 21.0286C37.1215 21.6096 37.2872 22.0926 37.3887 22.4402C37.4395 22.615 37.4835 22.7917 37.5205 22.9699L37.5263 23.0061C37.5647 23.2371 37.5108 23.474 37.3761 23.6656C37.2415 23.8572 37.0369 23.9882 36.8065 24.0304C36.5781 24.0675 36.3442 24.0126 36.1562 23.8777C35.9681 23.7427 35.8412 23.5388 35.8032 23.3106C35.7788 23.1817 35.7473 23.0544 35.7087 22.9291C35.5894 22.5284 35.4413 22.1369 35.2653 21.7577C34.8103 20.7661 33.9913 19.3964 32.547 17.9521C31.1027 16.5077 29.7342 15.6899 28.7413 15.2349C28.3625 15.059 27.9714 14.9108 27.5712 14.7916C27.4484 14.7571 27.3247 14.7259 27.2002 14.6982C26.9711 14.6598 26.7663 14.533 26.6298 14.3452C26.4932 14.1574 26.4358 13.9234 26.4698 13.6937Z"
                    fill="white"
                  />
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M26.7331 17.7185C26.7646 17.608 26.8175 17.5047 26.8889 17.4146C26.9603 17.3245 27.0487 17.2494 27.1492 17.1935C27.2496 17.1376 27.3601 17.102 27.4742 17.0888C27.5884 17.0756 27.7041 17.085 27.8146 17.1165L27.8181 17.1177L27.8216 17.1189L27.831 17.1212L27.8543 17.1282L27.9196 17.1515C27.9717 17.1694 28.0406 17.1966 28.1261 17.2332C28.2965 17.3055 28.5286 17.4175 28.8145 17.5867C29.385 17.925 30.1643 18.485 31.0801 19.402C31.996 20.3179 32.5571 21.0972 32.8955 21.6677C33.0646 21.9535 33.1766 22.1857 33.249 22.356C33.2877 22.4452 33.3227 22.5358 33.354 22.6279L33.3598 22.6512L33.3633 22.6605V22.664L33.3645 22.6652C33.3645 22.6652 33.3645 22.6675 32.5245 22.9079L33.3645 22.6675C33.4237 22.8883 33.3942 23.1235 33.2823 23.3228C33.1704 23.5221 32.9849 23.6697 32.7656 23.734C32.5463 23.7983 32.3105 23.7743 32.1086 23.667C31.9068 23.5597 31.755 23.3777 31.6856 23.1599L31.6821 23.1482L31.6413 23.0455C31.5669 22.8786 31.4827 22.7161 31.3893 22.559C31.1291 22.1204 30.659 21.4554 29.8423 20.6387C29.0256 19.822 28.3618 19.353 27.922 19.0929C27.733 18.982 27.5366 18.8845 27.334 18.8012L27.3223 18.7965C27.1019 18.7303 26.9165 18.5799 26.8062 18.3779C26.6959 18.1759 26.6697 17.9398 26.7331 17.7185Z"
                    fill="white"
                  />
                </svg>
              </button>
              <button onClick={onHangUp || close}>
                <svg
                  width="51"
                  height="51"
                  viewBox="0 0 51 51"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="51" height="51" rx="25.5" fill="#FE5050" />
                  <path
                    d="M20.5115 27.9062L20.5056 27.1346C20.5056 27.1346 20.4944 25.301 25.4952 25.525C30.496 25.749 30.5073 27.5826 30.5073 27.5826L30.5112 28.0695C30.5198 29.2661 31.4295 30.3239 32.6536 30.5576L35.1553 31.0369C36.6713 31.3265 38.0259 30.2524 38.0162 28.7704L37.9992 26.1132C37.9934 25.3787 37.759 24.6473 37.198 24.1234C35.7631 22.7842 32.2364 20.3283 25.459 20.0233C18.2726 19.7023 14.7791 22.7769 13.5401 24.2303C13.1469 24.6898 12.9961 25.2867 13.0001 25.8982L13.0169 28.3046C13.0272 29.9302 14.6538 31.1659 16.2572 30.7657L18.7526 30.145C19.8047 29.882 20.5192 28.974 20.5123 27.907"
                    fill="white"
                  />
                </svg>
              </button>
            </div>
            <p className="text-primary-text/50 mt-8">Call time 00.30.30</p>
            <p className="text-primary-text">Outgoing call</p>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
