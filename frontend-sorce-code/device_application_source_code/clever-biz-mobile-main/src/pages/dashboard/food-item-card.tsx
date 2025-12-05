import { Plus } from "lucide-react";
import { FoodItemTypes } from "./food-items";
import { cn } from "clsx-for-tailwind";

interface FoodItemCardProps {
    item: FoodItemTypes;
    onAdd: () => void;
}

export const FoodItemCard = ({ item, onAdd }: FoodItemCardProps) => {
    return (
        <div
            onClick={onAdd}
            className="group relative flex flex-row gap-3 sm:gap-4 p-3 bg-white rounded-3xl shadow-sm border border-border/40 hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden"
        >
            {/* Image Section */}
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-2xl overflow-hidden bg-gray-50 flex items-center justify-center">
                {item.image1 ? (
                    <img
                        src={(() => {
                            let url = item.image1;
                            if (url.startsWith("http://")) url = url.replace("http://", "https://");
                            if (url.startsWith("/")) url = `https://cleverdining-2.onrender.com${url}`;
                            return url;
                        })()}
                        alt={item.item_name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                    />
                ) : null}

                {/* Fallback Placeholder */}
                <div className={cn("absolute inset-0 bg-gray-100 flex items-center justify-center", item.image1 ? "hidden" : "")}>
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                    <h3 className="font-bold text-foreground truncate text-base sm:text-lg leading-tight">
                        {item.item_name}
                    </h3>

                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
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
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-secondary flex items-center justify-center text-foreground transition-colors hover:bg-primary hover:text-white active:scale-90"
                    >
                        <span className="text-xl leading-none mb-1">+</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
