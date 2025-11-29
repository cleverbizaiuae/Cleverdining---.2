import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { useEffect, useState } from "react";
import axiosInstance from "../lib/axios";
import { useCart } from "../context/CartContext";
import toast from "react-hot-toast";

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
      });
    } else {
      setItem(null);
      setShowVideo(false);
    }
  }, [isOpen, itemId]);
  return (
    <Dialog open={isOpen} onClose={() => close()} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/10" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel className=" bg-sidebar p-4 rounded-lg shadow-xl min-w-md">
          <div className="relative max-h-[300px] mx-auto aspect-square rounded-xl overflow-hidden flex justify-center items-center object-contain cursor-pointer">
            {showVideo && item?.video ? (
              <video
                src={item.video}
                controls
                autoPlay
                className="w-full h-full object-cover"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <img
                  src={item?.image1}
                  alt={item?.item_name || "img"}
                  className="w-full h-full object-cover"
                  onClick={() => item?.video && setShowVideo(true)}
                  style={{ cursor: item?.video ? "pointer" : "default" }}
                />
                {item?.video && (
                  <span
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                    onClick={() => setShowVideo(true)}
                  >
                    <svg
                      width="64"
                      height="64"
                      viewBox="0 0 64 64"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        cx="32"
                        cy="32"
                        r="32"
                        fill="#2962FF"
                        fillOpacity="0.7"
                      />
                      <polygon points="26,20 48,32 26,44" fill="#fff" />
                    </svg>
                  </span>
                )}
              </>
            )}
          </div>
          <p className="text-xl text-icon-active text-wrap font-medium mt-4">
            {truncatedName ? (
              <span className="text-xl md:text-2xl font-semibold truncate">
                {truncatedName}
              </span>
            ) : (
              "Loading..."
            )}
          </p>
          <p className="text-sm text-wrap max-w-lg text-primary/40 mb-4">
            {item?.description || ""}
          </p>
          <div className="flex items-center justify-between">
            <p className="text-icon-active text-wrap text-start font-bold text-2xl">
              {item ? `$${item.price}` : ""}
              <span className="text-sm font-normal">
                {" "}
                / {item?.category_name || ""}
              </span>
            </p>
            <button
              className="button-primary flex items-center gap-x-3 fill-primary-text"
              onClick={() => {
                if (item) {
                  addToCart(item);
                  toast.success("Added to cart!");
                  close();
                  if (onAddToCart) onAddToCart();
                }
              }}
            >
              <span>
                <svg
                  width="18"
                  height="20"
                  viewBox="0 0 18 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M5.375 6C5.30014 5.90123 5.2564 5.7824 5.24936 5.65867C5.24232 5.53494 5.27229 5.41192 5.33546 5.3053C5.39863 5.19867 5.49213 5.11328 5.60403 5.06002C5.71593 5.00676 5.84116 4.98804 5.96375 5.00625C6.12772 5.02979 6.27564 5.11746 6.375 5.25L9 8.75V0.625C9 0.45924 9.06585 0.300269 9.18306 0.183058C9.30027 0.065848 9.45924 0 9.625 0C9.79076 0 9.94973 0.065848 10.0669 0.183058C10.1842 0.300269 10.25 0.45924 10.25 0.625V8.75L12.875 5.25C12.9495 5.15167 13.0513 5.07752 13.1677 5.03684C13.2842 4.99616 13.41 4.99077 13.5295 5.02135C13.649 5.05192 13.7568 5.11709 13.8394 5.2087C13.922 5.3003 13.9757 5.41425 13.9937 5.53625C14.0054 5.61756 14.0009 5.70037 13.9805 5.77995C13.9602 5.85952 13.9243 5.9343 13.875 6L10.125 11C10.1175 11.01 10.1038 11.015 10.095 11.025C10.0534 11.0739 10.0045 11.116 9.95 11.15C9.93065 11.1662 9.90971 11.1805 9.8875 11.1925C9.80598 11.2332 9.71612 11.2544 9.625 11.2544C9.53388 11.2544 9.44402 11.2332 9.3625 11.1925C9.34029 11.1805 9.31935 11.1662 9.3 11.15C9.24553 11.116 9.19663 11.0739 9.155 11.025C9.14625 11.015 9.1325 11.01 9.125 11L5.375 6ZM6.1875 18.4375C6.18808 18.7466 6.09661 19.0489 5.92475 19.3058C5.75289 19.5627 5.50842 19.7626 5.2225 19.88C5.00912 19.9679 4.77894 20.0075 4.54846 19.996C4.31798 19.9844 4.0929 19.9221 3.88934 19.8134C3.68578 19.7047 3.50879 19.5523 3.37103 19.3672C3.23326 19.182 3.13815 18.9687 3.0925 18.7425C3.04901 18.5283 3.05094 18.3074 3.09817 18.094C3.1454 17.8806 3.23687 17.6795 3.36667 17.5036C3.49648 17.3278 3.66173 17.1811 3.85175 17.0731C4.04178 16.9652 4.25234 16.8982 4.46984 16.8767C4.68734 16.8552 4.90693 16.8795 5.11444 16.9481C5.32194 17.0168 5.51274 17.1282 5.6745 17.2752C5.83627 17.4221 5.96539 17.6014 6.05354 17.8014C6.14169 18.0014 6.1869 18.2177 6.18625 18.4362L6.1875 18.4375ZM16.1875 18.4375C16.1881 18.7466 16.0966 19.0489 15.9247 19.3058C15.7529 19.5627 15.5084 19.7626 15.2225 19.88C15.0091 19.9679 14.7789 20.0075 14.5485 19.996C14.318 19.9844 14.0929 19.9221 13.8893 19.8134C13.6858 19.7047 13.5088 19.5523 13.371 19.3672C13.2333 19.182 13.1382 18.9687 13.0925 18.7425C13.051 18.5292 13.0545 18.3096 13.1028 18.0977C13.151 17.8858 13.243 17.6863 13.3727 17.512C13.5025 17.3377 13.6673 17.1924 13.8564 17.0854C14.0456 16.9784 14.255 16.9121 14.4712 16.8907C14.6875 16.8693 14.9058 16.8933 15.1123 16.9611C15.3187 17.0289 15.5088 17.1391 15.6702 17.2846C15.8316 17.4301 15.9609 17.6076 16.0498 17.806C16.1386 18.0043 16.1851 18.2189 16.1862 18.4362L16.1875 18.4375ZM16.5 6.875C16.3342 6.875 16.1753 6.94085 16.0581 7.05806C15.9408 7.17527 15.875 7.33424 15.875 7.5L15.25 12.5H4.1125L2.7375 4.275C2.71335 4.1297 2.63865 3.99759 2.52658 3.90199C2.41452 3.8064 2.2723 3.75345 2.125 3.7525H0.875C0.70924 3.7525 0.550268 3.81835 0.433058 3.93556C0.315848 4.05277 0.25 4.21174 0.25 4.3775C0.25 4.54326 0.315848 4.70223 0.433058 4.81944C0.550268 4.93665 0.70924 5.0025 0.875 5.0025H1.595L3.3825 15.7275C3.40581 15.8739 3.48078 16.0071 3.59383 16.1029C3.70688 16.1988 3.85053 16.2509 3.99875 16.25H15.2487C15.4145 16.25 15.5735 16.1842 15.6907 16.0669C15.8079 15.9497 15.8737 15.7908 15.8737 15.625C15.8737 15.4592 15.8079 15.3003 15.6907 15.1831C15.5735 15.0658 15.4145 15 15.2487 15H4.52375L4.315 13.75H15.24C15.5446 13.7499 15.8387 13.6386 16.067 13.437C16.2954 13.2353 16.4422 12.9573 16.48 12.655L17.115 7.505C17.115 7.33924 17.0492 7.18027 16.9319 7.06306C16.8147 6.94585 16.6558 6.88 16.49 6.88L16.5 6.875Z" />
                </svg>
              </span>
              <span>Add To Cart</span>
            </button>
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
        <DialogPanel className=" bg-primary/90 p-4 rounded-lg shadow-xl min-w-lg">
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
        <DialogPanel className=" bg-primary/90 p-4 rounded-lg shadow-xl min-w-lg">
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
