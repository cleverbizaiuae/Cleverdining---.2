import { cn } from "clsx-for-tailwind";
import { getSessionCurrencyCode } from "../../utils/regionSession";
import { OptimizedImage } from "../../components/OptimizedImage";
import { resolveMediaUrl } from "../../lib/media";
import type { PreparationTimeSource } from "../../utils/preparationTime";

export type FoodItemTypes = PreparationTimeSource & {
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
  video?: string | null;
  restaurant_name: string;
  sub_category?: number;
  discount_percentage?: number; // Added
};

type Props = {
  item: FoodItemTypes;
  showFood: (id: number) => void;
};

import { Plus } from "lucide-react";

export const FoodItems = ({ item, showFood }: Props) => {
  const price = parseFloat(item.price);
  const discount = item.discount_percentage || 0;
  const discountedPrice = discount > 0 ? price - (price * discount / 100) : price;
  const currencyCode = getSessionCurrencyCode();

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
            <div className="absolute top-0 right-0 bg-brand-accent text-brand-accent-text text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">
              {discount}% OFF
            </div>
          )}

          {/* Left Side: Image or Video Thumbnail */}
          <div className="w-[100px] h-[100px] flex-shrink-0 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center relative">
            {(!item.image1 && item.video) ? (
              <video
                src={`${resolveMediaUrl(item.video, "")}#t=0.5`}
                muted
                playsInline
                preload="metadata"
                className="object-cover w-full h-full"
                about="Video Thumbnail"
              />
            ) : (
              <OptimizedImage
                src={item.image1}
                alt={item.item_name}
                width={100}
                height={100}
                className="object-cover w-full h-full"
              />
            )}

            {/* Tiny Video Icon Overlay if video exists */}
            {item.video && item.image1 && (
              <div className="absolute bottom-1 right-1 bg-black/50 p-1 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              </div>
            )}
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
              <span className="text-primary font-bold text-base">
                {currencyCode} {discountedPrice.toFixed(2)}
              </span>
              {discount > 0 && (
                <span className="text-gray-400 text-xs line-through">
                  {currencyCode} {price.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Right Side: Add Button */}
          <div className="flex flex-col justify-center items-center h-full pl-2">
            <button
              className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-text transition-colors shadow-sm"
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
