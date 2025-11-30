import { cn } from "clsx-for-tailwind";
import * as LucideIcons from "lucide-react";
import React from "react";

export type CategoryItemType = {
  id: number;
  Category_name: string;
  slug: string;
  image: string;
  parent_category?: number | null;
  level?: number;
  icon?: string;
  icon_image?: string;
};

type Props = {
  cat: CategoryItemType;
  isActive: boolean;
  onClick: () => void;
};

export const CategoryItem = ({
  cat,
  isActive,
  onClick,
}: Props) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative shrink-0 h-32 w-28 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 snap-start select-none",
        isActive ? "ring-2 ring-blue-500 scale-105 shadow-lg" : "shadow-md border border-gray-100"
      )}
    >
      {/* Full-bleed Background Image */}
      <img
        src={(() => {
          if (!cat.image) return "https://placehold.co/200x300?text=No+Image";
          let url = cat.image;
          if (url.startsWith("http://")) {
            url = url.replace("http://", "https://");
          }
          if (url.startsWith("/")) {
            url = `https://cleverdining-2.onrender.com${url}`;
          }
          return url;
        })()}
        alt={cat.Category_name}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 hover:scale-110"
        onError={(e) => {
          e.currentTarget.src = "https://placehold.co/200x300?text=No+Image";
        }}
      />

      {/* Dark Overlay for Readability */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-3 p-2">
        {/* Icon Badge */}
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors duration-300",
            isActive ? "bg-white text-blue-600" : "bg-white text-gray-800"
          )}
        >
          {cat.icon_image ? (
            <img
              src={(() => {
                let url = cat.icon_image;
                if (url.startsWith("http://")) url = url.replace("http://", "https://");
                if (url.startsWith("/")) url = `https://cleverdining-2.onrender.com${url}`;
                return url;
              })()}
              alt="icon"
              className="w-6 h-6 object-contain"
            />
          ) : cat.icon && (LucideIcons as any)[cat.icon] ? (
            React.createElement((LucideIcons as any)[cat.icon], {
              size: 20,
              className: "stroke-[2px]"
            })
          ) : (
            <LucideIcons.UtensilsCrossed size={20} className="stroke-[2px]" />
          )}
        </div>

        {/* Category Label */}
        <span
          className={cn(
            "text-white text-xs text-center leading-tight drop-shadow-md px-1 w-full truncate",
            isActive ? "font-bold" : "font-semibold"
          )}
        >
          {cat.Category_name}
        </span>
      </div>
    </div>
  );
};
