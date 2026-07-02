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
          ? "scale-105 border-primary shadow-lg shadow-primary/30"
          : "border-transparent opacity-75 hover:border-primary/30 hover:opacity-100",
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
          <span className="text-xl">📁</span>
        </div>
      )}

      <span
        className={cn(
          "relative z-10 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur-md transition-colors duration-200 sm:text-xs",
          "max-w-[90%] text-center leading-[1.1] whitespace-normal break-words",
          isActive ? "bg-primary text-white" : "bg-black/45 text-white",
        )}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {cat.Category_name}
      </span>
    </button>
  );
};
