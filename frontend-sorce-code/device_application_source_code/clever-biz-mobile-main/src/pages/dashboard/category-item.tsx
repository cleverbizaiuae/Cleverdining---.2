import { cn } from "clsx-for-tailwind";
import { API_BASE_URL } from "../../lib/axios";

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
        "relative flex flex-col items-center justify-center gap-2 group shrink-0 transition-all duration-300 rounded-2xl overflow-hidden border px-1",
        "min-w-[4rem] w-auto h-16 sm:w-20 sm:h-20",
        isActive
          ? "border-primary shadow-lg shadow-primary/25 scale-105"
          : "border-transparent bg-gray-100 hover:border-primary/30 scale-100"
      )}
    >
      {/* Wrapper for Image & Overlay */}
      <div className="absolute inset-0 bg-gray-100">
        {cat.image ? (
          <img
            src={(() => {
              let url = cat.image;
              if (url.startsWith("http://")) url = url.replace("http://", "https://");
              if (url.startsWith("/")) url = `${API_BASE_URL}${url}`;
              return url;
            })()}
            alt={cat.Category_name}
            className="w-full h-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-110"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}

        {/* Fallback Placeholder */}
        <div className={cn("absolute inset-0 flex items-center justify-center", cat.image ? "hidden" : "")}>
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>

        {/* Color Overlay */}
        <div className={cn(
          "absolute inset-0 transition-colors duration-300",
          isActive
            ? "bg-primary/20"
            : "bg-black/10 group-hover:bg-black/0"
        )} />
      </div>

      {/* Text Label */}
      <span className={cn(
        "relative z-10 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full backdrop-blur-md transition-colors duration-300 shadow-sm whitespace-nowrap",
        isActive
          ? "bg-primary text-white"
          : "bg-white/90 text-gray-800"
      )}>
        {cat.Category_name}
      </span>
    </button>
  );
};
