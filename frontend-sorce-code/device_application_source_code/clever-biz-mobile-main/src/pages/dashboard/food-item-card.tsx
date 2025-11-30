import React from "react";
import { cn } from "clsx-for-tailwind";
import { Plus } from "lucide-react";
import { FoodItemTypes } from "./food-items";

interface FoodItemCardProps {
    item: FoodItemTypes;
    onAdd: () => void;
}

export const FoodItemCard: React.FC<FoodItemCardProps> = ({ item, onAdd }) => {
    return (
        <div className="group relative flex w-full items-start gap-3 rounded-3xl border border-gray-200/40 bg-white p-3 shadow-sm transition-all duration-300 hover:shadow-md">
            {/* Image Container */}
            <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-2xl">
                <img
                    src={(() => {
                        if (!item.image1) return "https://placehold.co/112x112?text=No+Image";
                        let url = item.image1;
                        if (url.startsWith("http://")) url = url.replace("http://", "https://");
                        if (url.startsWith("/")) url = `https://cleverdining-2.onrender.com${url}`;
                        return url;
                    })()}
                    alt={item.item_name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
            </div>

            {/* Content Container */}
            <div className="flex flex-1 flex-col justify-between h-28 py-1">
                <div>
                    <div className="flex items-start justify-between">
                        <h3 className="text-lg font-bold leading-tight text-gray-900 line-clamp-2">
                            {item.item_name}
                        </h3>
                        {/* Veg/Non-veg indicator could go here if needed */}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                        {item.description}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-auto">
                    <span className="text-lg font-bold text-blue-600">
                        AED {item.price}
                    </span>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAdd();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors duration-300 group-hover:bg-blue-600 group-hover:text-white"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
