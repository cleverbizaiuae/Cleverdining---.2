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
        "relative flex flex-col items-center justify-center gap-2 group shrink-0 transition-all duration-300 rounded-2xl overflow-hidden border px-1 snap-start",
        "min-w-[64px] w-auto h-[64px] sm:min-w-[80px] sm:h-[80px]", // SMART RECTANGLE: Min 64px, Auto-expand for long text
        isActive
          ? "border-primary shadow-md shadow-primary/25"
          : "border-gray-200 bg-gray-50 hover:border-primary/30"
      )}
    >
      {/* Background Image (Layer 0) */}
      {cat.image ? (
        <img
          src={(() => {
            let url = cat.image;
            if (url.startsWith("http://")) url = url.replace("http://", "https://");
            if (url.startsWith("/")) url = `${API_BASE_URL}${url}`;
            return url;
          })()}
          alt={cat.Category_name}
          className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-500 z-0"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}

      {/* Fallback Placeholder (Layer 0) */}
      <div className={cn("absolute inset-0 bg-gray-200 flex items-center justify-center z-0", cat.image ? "hidden" : "")}>
        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {/* Color Overlay (Layer 1) */}
      <div className={cn(
        "absolute inset-0 transition-colors duration-300 z-0",
        isActive
          ? "bg-primary/20"
          : "bg-black/10 group-hover:bg-black/0"
      )} />

      {/* Text Label (Layer 2 - Top) */}
      <span className={cn(
        "relative z-10 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold text-center transition-colors duration-300 shadow-sm whitespace-nowrap", // EXPAND: whitespace-nowrap, no truncate
        isActive
          ? "bg-primary text-white"
          : "bg-white/90 text-gray-800 backdrop-blur-md"
      )}
        style={{ fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif' }}
      >
        {cat.Category_name}
      </span>
    </button>
  );
};
