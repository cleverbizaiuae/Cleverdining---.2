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
            className="group relative flex items-center gap-4 p-3 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden"
        >
            {/* Image Section */}
            <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-gray-50">
                <img
                    src={(() => {
                        if (!item.image1) return "https://placehold.co/100x100?text=No+Image";
                        let url = item.image1;
                        if (url.startsWith("http://")) url = url.replace("http://", "https://");
                        if (url.startsWith("/")) url = `https://cleverdining-2.onrender.com${url}`;
                        return url;
                    })()}
                    alt={item.item_name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
            </div>

            {/* Content Section */}
            <div className="flex-1 min-w-0 py-1">
                <div className="flex justify-between items-start gap-2">
                    <h3 className="font-bold text-gray-900 truncate pr-2 text-base">
                        {item.item_name}
                    </h3>
                </div>

                <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                    {item.description || "No description available."}
                </p>

                <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-bold text-primary">
                        AED {item.price}
                    </span>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAdd();
                        }}
                        className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary transition-colors hover:bg-primary hover:text-white active:scale-90"
                    >
                        <Plus size={18} strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </div>
    );
};
