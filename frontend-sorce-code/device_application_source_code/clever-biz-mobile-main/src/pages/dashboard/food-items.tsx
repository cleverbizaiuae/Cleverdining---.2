import { cn } from "clsx-for-tailwind";
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
};

type Props = {
  item: FoodItemTypes;
  showFood: (id: number) => void;
};

import { Plus } from "lucide-react";

export const FoodItems = ({ item, showFood }: Props) => {
  return (
    <>
      {item.availability && (
        <div
          onClick={() => showFood(item.id)}
          className={cn(
            "bg-white flex flex-row items-start justify-start rounded-2xl shadow-sm p-3 select-none cursor-pointer transition-all duration-300 hover:shadow-md border border-gray-100",
            "w-full h-auto min-h-[110px] gap-x-4"
          )}
        >
          {/* Left Side: Image */}
          <div className="w-[100px] h-[100px] flex-shrink-0 rounded-xl overflow-hidden bg-gray-50">
            <img
              src={(() => {
                if (!item.image1) return "https://placehold.co/200x200?text=No+Image";
                let url = item.image1;
                // Fix double media path
                url = url.replace("/media/media/", "/media/");
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

          {/* Right Side: Details */}
          <div className="flex-1 flex flex-col justify-between h-[100px] py-1">
            <div className="flex flex-col gap-y-1">
              <h3 className="text-gray-900 font-semibold text-base leading-tight line-clamp-1">
                {item.item_name}
              </h3>
              <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">
                {item.description || "Prepared with fresh ingredients."}
              </p>
            </div>

            <div className="flex justify-between items-end w-full">
              <span className="text-blue-600 font-bold text-base">
                AED {item.price}
              </span>

              {/* Floating Add Button */}
              <button
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  showFood(item.id);
                }}
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
