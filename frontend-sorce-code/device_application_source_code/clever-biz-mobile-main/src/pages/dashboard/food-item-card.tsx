import { Plus, Play, UtensilsCrossed, X } from "lucide-react";
import { useState } from "react";
import { FoodItemTypes } from "./food-items";
import { cn } from "clsx-for-tailwind";
import { API_BASE_URL } from "../../lib/axios";
import { getSessionCurrencyCode } from "../../utils/regionSession";
import { OptimizedImage } from "../../components/OptimizedImage";

interface FoodItemCardProps {
    item: FoodItemTypes;
    onAdd: () => void;
}

export const FoodItemCard = ({ item, onAdd }: FoodItemCardProps) => {
    const [showVideo, setShowVideo] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const price = parseFloat(item.price);
    const discount = item.discount_percentage || 0;
    const discountedPrice = discount > 0 ? price - (price * discount / 100) : price;
    const currencyCode = getSessionCurrencyCode();
    const isAvailable = item.availability !== false;

    return (
        <div
            onClick={() => {
                if (!isAvailable) return;
                onAdd();
            }}
            className={cn(
                "group relative grid grid-cols-[auto_1fr] gap-3 sm:gap-4 p-3 bg-white rounded-3xl shadow-sm border border-border/40 hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden min-h-[7rem] active:scale-[0.98] transition-transform duration-100",
                !isAvailable ? "opacity-65" : ""
            )}
        >
            {/* Discount Badge */}
            {discount > 0 && (
                <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">
                    {discount}% OFF
                </div>
            )}

            {!isAvailable && (
                <div className="absolute inset-0 bg-white/40 z-20 pointer-events-none">
                    <span className="absolute left-3 top-3 rounded-full bg-slate-700 text-white text-[10px] font-bold px-2.5 py-1">
                        Sold out
                    </span>
                </div>
            )}

            {/* Image/Video Section - Fixed Width */}
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-2xl overflow-hidden bg-gray-50 flex items-center justify-center self-center">

                {/* Video Player Overlay */}
                {showVideo && item.video ? (
                    <div className="absolute inset-0 z-20 bg-black flex flex-col">
                        <video
                            src={(() => {
                                let url = item.video as string;
                                if (url.startsWith("http://")) url = url.replace("http://", "https://");
                                if (url.startsWith("/")) url = `${API_BASE_URL}${url}`;
                                return url;
                            })()}
                            className="w-full h-full object-cover"
                            autoPlay
                            controls={false}
                            playsInline
                            webkit-playsinline="true"
                            loop
                        // Add simple click to toggle play/pause or just close? 
                        // Spec says: "Close -> returns to image view".
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowVideo(false);
                            }}
                            className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    (item.video && !item.image1) ? (
                        <video
                            src={(() => {
                                let url = item.video as string;
                                if (url.startsWith("http://")) url = url.replace("http://", "https://");
                                if (url.startsWith("/")) url = `${API_BASE_URL}${url}`;
                                return url;
                            })()}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            webkit-playsinline="true"
                            loop
                            autoPlay
                        />
                    ) : (
                        <>
                            {item.image1 && !imageFailed ? (
                                <OptimizedImage
                                    src={item.image1}
                                    alt={item.item_name}
                                    width={112}
                                    height={112}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    onError={() => {
                                        setImageFailed(true);
                                    }}
                                />
                            ) : null}

                            {/* Fallback Placeholder */}
                            <div className={cn("absolute inset-0 bg-slate-100 flex items-center justify-center", item.image1 && !imageFailed ? "hidden" : "")}>
                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                                    <UtensilsCrossed className="w-5 h-5 text-slate-500" strokeWidth={1.8} />
                                </div>
                            </div>
                        </>
                    )
                )}
                {/* Play Button Overlay - Show if video exists (regardless of whether it's playing a cover or using an image) */}
                {item.video && !showVideo && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowVideo(true);
                        }}
                        className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors group/video"
                    >
                        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/50 group-hover/video:scale-110 transition-transform">
                            <Play size={14} className="text-white fill-white ml-0.5" />
                        </div>
                    </button>
                )}
            </div>

            {/* Content Section */}
            <div className="flex flex-col justify-between h-full py-1">
                <div>
                    <h3 className="font-bold text-foreground truncate text-base sm:text-lg leading-tight">
                        {item.item_name}
                    </h3>

                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {item.description || "No description available."}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-2">
                    <div className="flex flex-col">
                        <span className="text-base sm:text-lg font-bold text-primary">
                            {currencyCode} {discountedPrice.toFixed(2)}
                        </span>
                        {discount > 0 && (
                            <span className="text-[10px] sm:text-xs text-gray-400 line-through">
                                {currencyCode} {price.toFixed(2)}
                            </span>
                        )}
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isAvailable) return;
                            onAdd();
                        }}
                        disabled={!isAvailable}
                        className={cn(
                            "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors active:scale-90 shadow-sm",
                            isAvailable
                                ? "bg-primary text-white hover:bg-primary/90"
                                : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        )}
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </div>
    );
};
