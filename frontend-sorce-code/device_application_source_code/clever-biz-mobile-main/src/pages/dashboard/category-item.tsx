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
        "relative w-28 h-28 rounded-2xl overflow-hidden transition-all duration-300 group snap-start shrink-0",
        isActive
          ? "scale-105 shadow-lg ring-2 ring-primary ring-offset-2"
          : "scale-100 opacity-90 hover:opacity-100"
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
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />

      {/* Overlay */}
      <div className={cn(
        "absolute inset-0 transition-colors duration-300",
        isActive
          ? "bg-primary/20 backdrop-blur-[1px]"
          : "bg-black/40 group-hover:bg-black/30"
      )} />

      {/* Label */}
      <div className="absolute bottom-2 left-2 right-2">
        <div className={cn(
          "px-2 py-1 rounded-full text-[10px] font-bold text-center truncate transition-colors duration-300",
          isActive
            ? "bg-white text-primary shadow-sm"
            : "bg-black/50 text-white backdrop-blur-sm"
        )}>
          {cat.Category_name}
        </div>
      </div>

      {/* Active Indicator Dot */}
      {isActive && (
        <motion.div
          layoutId="active-cat-dot"
          className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border border-white"
        />
      )}
    </button>
  );
};
