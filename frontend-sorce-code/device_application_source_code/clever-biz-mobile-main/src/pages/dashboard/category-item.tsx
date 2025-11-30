import React from "react";
import { cn } from "clsx-for-tailwind";
import * as LucideIcons from "lucide-react";

export type CategoryItemType = {
  id: number;
  Category_name: string;
  image?: string;
  parent_category?: number | null;
  icon?: string;
  icon_image?: string;
};

interface CategoryItemProps {
  cat: CategoryItemType;
  isActive: boolean;
  onClick: () => void;
}

export const CategoryItem: React.FC<CategoryItemProps> = ({
  cat,
  isActive,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ease-out group",
        isActive
          ? "border-2 border-primary shadow-lg scale-105"
          : "border-2 border-transparent opacity-90 hover:opacity-100"
      )}
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={(() => {
            if (!cat.image) return "https://placehold.co/100x100?text=No+Image";
            let url = cat.image;
            if (url.startsWith("http://")) url = url.replace("http://", "https://");
            if (url.startsWith("/")) url = `https://cleverdining-2.onrender.com${url}`;
            return url;
          })()}
          alt={cat.Category_name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {/* Overlay */}
        <div
          className={cn(
            "absolute inset-0 transition-colors duration-300",
            isActive ? "bg-primary/20" : "bg-black/10"
          )}
        />
      </div>

      {/* Centered Label */}
      <div className="absolute inset-0 flex items-center justify-center p-1">
        <span
          className={cn(
            "px-2 py-1 rounded-full text-xs font-bold text-center truncate max-w-full shadow-sm transition-colors duration-300",
            isActive
              ? "bg-primary text-white"
              : "bg-white/90 text-gray-800 backdrop-blur-sm"
          )}
        >
          {cat.Category_name}
        </span>
      </div>
    </div>
  );
};
