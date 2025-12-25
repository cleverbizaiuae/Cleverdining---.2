import { cn } from "clsx-for-tailwind";
import { useRef } from "react";
import { useWebSocket } from "@/components/WebSocketContext";

export type FoodItemTypes = {
  id: number;
  item_name: string;
  price: string;
  description: string;
  slug: string;
  category: number;
  restaurant: number;
  category_name: string;
  image1: string;
  availability: boolean;
  video: string;
  restaurant_name: string;
  sub_category?: number;
  discount_percentage?: number; // Added
};

type Props = {
  item: FoodItemTypes;
  showFood: (id: number) => void;
};

import { Plus, Tag } from "lucide-react"; // Added Tag icon

export const FoodItems = ({ item, showFood }: Props) => {
  const price = parseFloat(item.price);
  const discount = item.discount_percentage || 0;
  const discountedPrice = discount > 0 ? price - (price * discount / 100) : price;

  return (
    <>
      {item.availability && (
        <div
          onClick={() => showFood(item.id)}
          className={cn(
            "bg-white flex flex-row items-center justify-between rounded-2xl shadow-sm p-3 select-none cursor-pointer transition-all duration-300 hover:shadow-md border border-gray-100 relative overflow-hidden", // Added relative/overflow for badge
            "w-full h-auto min-h-[110px] gap-x-4"
          )}
        >
          {/* Discount Badge */}
          {discount > 0 && (
            <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">
              {discount}% OFF
            </div>
          )}

          {/* Left Side: Image */}
          <div className="w-[100px] h-[100px] flex-shrink-0 rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
            <img
              src={(() => {
                if (!item.image1) return "https://placehold.co/200x200?text=No+Image";
                let url = item.image1;
                // Fix double media path
                // url = url.replace("/media/media/", "/media/");
                // Force HTTPS
                if (url.startsWith("http://")) {
                  url = url.replace("http://", "https://");
                }
                // Handle relative paths
                if (url.startsWith("/")) {
                  url = `https://cleverdining-2.onrender.com${url}`;
                }
                return url;
              })()}
              alt={item.item_name}
              className="object-cover w-full h-full"
              onError={(e) => {
                e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
              }}
            />
          </div>

          {/* Center: Details */}
          <div className="flex-1 flex flex-col justify-center h-full gap-y-1">
            <h3 className="text-gray-900 font-semibold text-base leading-tight line-clamp-2">
              {item.item_name}
            </h3>
            <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">
              {item.description || "Prepared with fresh ingredients."}
            </p>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-blue-600 font-bold text-base">
                AED {discountedPrice.toFixed(2)}
              </span>
              {discount > 0 && (
                <span className="text-gray-400 text-xs line-through">
                  AED {price.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Right Side: Add Button */}
          <div className="flex flex-col justify-center items-center h-full pl-2">
            <button
              className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                showFood(item.id);
              }}
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
