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
        // Layout: Flex Column, strict 80x90 size
        "flex flex-col items-center justify-start p-2 gap-2 transition-all duration-200",
        "w-[80px] h-[90px] shrink-0",
        // Shape & Borders
        "rounded-xl border",
        isActive
          ? "bg-[#0055FE] text-white border-transparent shadow-[0_10px_15px_rgba(0,85,254,0.3)]"
          : "bg-white text-slate-700 border-slate-200 hover:border-[#0055FE]/50"
      )}
    >
      {/* Icon Container: Strict 40x40px */}
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
              e.currentTarget.parentElement?.classList.remove('bg-slate-100'); // Remove white bg if fallback logic needed
              // Force fallback icon display if needed, but we used nextSibling logic before
              // Since we are in strict React, simpler to just hide img and show fallback
            }}
          />
        ) : (
          <span className="text-[20px]">📁</span>
        )}

        {/* Fallback if Image Fails or is Duplicate - keeping logic simple for now */}
        {cat.image && (
          <span className="hidden text-[20px]">📁</span>
        )}
      </div>

      {/* Text Container: ~26px height remaining */}
      <div className="w-full flex-1 flex items-center justify-center overflow-hidden">
        <span
          className={cn(
            "text-[10px] font-medium leading-[1.1] text-center w-full block break-words whitespace-normal",
            isActive ? "text-white" : "text-slate-700"
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
      </div>
    </button>
  );
};
