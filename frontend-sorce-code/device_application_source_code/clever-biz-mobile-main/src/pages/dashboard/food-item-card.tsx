import { Plus } from "lucide-react";
import { FoodItemTypes } from "./food-items";

interface FoodItemCardProps {
    item: FoodItemTypes;
    onAdd: () => void;
}

export const FoodItemCard = ({ item, onAdd }: FoodItemCardProps) => {
    return (
        <div
            onClick={onAdd}
            className="group relative flex flex-row gap-3 sm:gap-4 p-3 bg-white rounded-3xl shadow-sm border border-gray-200/40 hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden"
        >
            {/* Image Section */}
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-2xl overflow-hidden bg-gray-50">
                <img
                    src={(() => {
                        if (!item.image1) return "https://placehold.co/100x100?text=No+Image";
                        let url = item.image1;
                        if (url.startsWith("http://")) url = url.replace("http://", "https://");
                        if (url.startsWith("/")) url = `https://cleverdining-2.onrender.com${url}`;
                        return url;
                    })()}
                    alt={item.item_name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
            </div>

            {/* Content Section */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                    <h3 className="font-bold text-gray-900 truncate text-base sm:text-lg leading-tight">
                        {item.item_name}
                    </h3>

                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                        {item.description || "No description available."}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-2">
                    <span className="text-base sm:text-lg font-bold text-primary">
                        AED {item.price}
                    </span>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAdd();
                        }}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-900 transition-colors hover:bg-primary hover:text-white active:scale-90"
                    >
                        <span className="text-xl leading-none mb-1">+</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
