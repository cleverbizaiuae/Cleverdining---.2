import { cn } from "clsx-for-tailwind";
import { motion } from "motion/react";

export type CategoryItemType = {
  id: number;
  Category_name: string;
  image?: string;
  parent_category?: number | null;
};

interface CategoryItemProps {
  cat: CategoryItemType;
  isActive: boolean;
  onClick: () => void;
}

export const CategoryItem = ({ cat, isActive, onClick }: CategoryItemProps) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-16 h-16 rounded-2xl overflow-hidden transition-all duration-300 group shrink-0 border flex flex-col items-center justify-center",
        isActive
          ? "border-primary shadow-lg shadow-primary/25 scale-105"
          : "border-transparent bg-gray-100 hover:border-primary/30 scale-100"
      )}
    >
      {/* Background Image */}
      <img
        src={(() => {
          if (!cat.image) return "https://placehold.co/100x100?text=No+Image";
          let url = cat.image;
          if (url.startsWith("http://")) url = url.replace("http://", "https://");
          if (url.startsWith("/")) url = `https://cleverdining-2.onrender.com${url}`;
          return url;
        })()}
        alt={cat.Category_name}
        className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-110 z-0"
      />

      {/* Overlay */}
      <div className={cn(
        "absolute inset-0 transition-colors duration-300 z-0",
        isActive
          ? "bg-primary/20"
          : "bg-black/10 group-hover:bg-black/0"
      )} />

      {/* Label */}
      <div className={cn(
        "relative z-10 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold text-center truncate transition-colors duration-300 max-w-[90%] shadow-sm",
        isActive
          ? "bg-primary text-white"
          : "bg-white/90 text-gray-800 backdrop-blur-md"
      )}>
        {cat.Category_name}
      </div>
    </button>
  );
};
