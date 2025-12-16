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
        // Layout & Spacing
        "flex flex-col items-center justify-start p-2 gap-2 transition-all duration-200",
        // Fixed Dimensions
        "w-[80px] h-[90px] shrink-0",
        // Shape & Border
        "rounded-xl border",
        // Dynamic Styles
        isActive
          ? "bg-[#0055FE] text-white border-transparent shadow-[0_10px_15px_rgba(0,85,254,0.3)]"
          : "bg-white text-slate-700 border-slate-200 hover:border-[#0055FE]/50"
      )}
    >
      {/* Icon Container - Fixed 40x40px */}
      <div
        className={cn(
          "w-10 h-10 shrink-0 flex items-center justify-center rounded-lg overflow-hidden",
          isActive ? "bg-white/20" : "bg-slate-100"
        )}
      >
        {cat.image ? (
          <img
            src={(() => {
              let url = cat.image;
              if (url.startsWith("http://")) url = url.replace("http://", "https://");
              if (url.startsWith("/")) url = `${API_BASE_URL}${url}`;
              return url;
            })()}
            alt={cat.Category_name}
            className="w-full h-full object-cover object-center"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : (
          <span className="text-lg">📁</span>
        )}

        {/* Fallback Placeholder (Hidden by default) */}
        <div className={cn("hidden w-full h-full items-center justify-center", !cat.image ? (isActive ? "text-white" : "text-gray-400") : "text-transparent")}>
          {!cat.image && <span className="text-lg">📁</span>}
        </div>
      </div>

      {/* Text Container - Flexible Height, Max 2 lines */}
      <div className="w-full flex-1 mt-0 px-1 overflow-hidden">
        <span
          className={cn(
            "text-[10px] font-medium leading-[1.2] text-center w-full block",
            isActive ? "text-white" : "text-slate-700"
          )}
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            wordBreak: "break-word",
          }}
        >
          {cat.Category_name}
        </span>
      </div>
    </button>
  );
};
