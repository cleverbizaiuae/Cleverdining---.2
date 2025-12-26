import { Plus, Play, X } from "lucide-react";
import { useState } from "react";
import { FoodItemTypes } from "./food-items";
import { cn } from "clsx-for-tailwind";
import { API_BASE_URL } from "../../lib/axios";

interface FoodItemCardProps {
    item: FoodItemTypes;
    onAdd: () => void;
}

export const FoodItemCard = ({ item, onAdd }: FoodItemCardProps) => {
    const [showVideo, setShowVideo] = useState(false);
    const price = parseFloat(item.price);
    const discount = item.discount_percentage || 0;
    const discountedPrice = discount > 0 ? price - (price * discount / 100) : price;

    return (
        <div
            onClick={onAdd}
            className="group relative grid grid-cols-[auto_1fr] gap-3 sm:gap-4 p-3 bg-white rounded-3xl shadow-sm border border-border/40 hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden min-h-[7rem]"
        >
            {/* Discount Badge */}
            {discount > 0 && (
                <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">
                    {discount}% OFF
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
                        {item.image1 ? (
                            <img
                                src={(() => {
                                    let url = item.image1;
                                    if (url.startsWith("http://")) url = url.replace("http://", "https://");
                                    if (url.startsWith("/")) url = `${API_BASE_URL}${url}`;
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

                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {item.description || "No description available."}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-2">
                    <div className="flex flex-col">
                        <span className="text-base sm:text-lg font-bold text-primary">
                            AED {discountedPrice.toFixed(2)}
                        </span>
                        {discount > 0 && (
                            <span className="text-[10px] sm:text-xs text-gray-400 line-through">
                                AED {price.toFixed(2)}
                            </span>
                        )}
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAdd();
                        }}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-secondary flex items-center justify-center text-foreground transition-colors hover:bg-primary hover:text-white active:scale-90 shadow-sm"
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </div>
    );
};
