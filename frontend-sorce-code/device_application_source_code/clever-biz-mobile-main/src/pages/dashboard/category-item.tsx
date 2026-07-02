import { ImageIcon } from "lucide-react";
import { cn } from "clsx-for-tailwind";
import { resolveMediaUrl } from "../../lib/media";

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
        "group relative flex min-w-16 flex-col items-center justify-center gap-2 overflow-hidden px-1 transition-all duration-300",
        "h-16 w-auto shrink-0 rounded-2xl border sm:h-20 sm:w-20",
        isActive
          ? "scale-105 border-primary shadow-lg shadow-primary/25"
          : "border-border/40 opacity-90 hover:border-primary/30 hover:opacity-100",
      )}
    >
      {cat.image ? (
        <div className="absolute inset-0 z-0">
          <img
            src={resolveMediaUrl(cat.image)}
            alt={cat.Category_name}
            width={72}
            height={72}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="w-full h-full object-cover object-center opacity-90 transition-transform duration-500 group-hover:scale-110"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement?.classList.add("bg-secondary");
            }}
          />
          <div className={cn("absolute inset-0 transition-colors", isActive ? "bg-primary/25" : "bg-black/20 group-hover:bg-black/5")} />
        </div>
      ) : (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-secondary">
          <ImageIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
        </div>
      )}

      <span
        className={cn(
          "relative z-10 px-1 text-[11px] font-semibold text-white transition-colors duration-200",
          "max-w-[90%] text-center leading-[1.1] whitespace-normal break-words",
        )}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textShadow: "0 1px 8px rgba(0,0,0,0.65)",
        }}
      >
        {cat.Category_name}
      </span>
    </button>
  );
};
