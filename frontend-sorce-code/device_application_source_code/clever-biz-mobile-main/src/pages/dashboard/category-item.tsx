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
        // Layout
        "relative flex flex-col items-center justify-center p-1 transition-all duration-200 overflow-hidden",
        // Dimensions
        "w-[80px] h-[90px] shrink-0",
        // Shape
        "rounded-2xl border",
        // Border Styles
        isActive
          ? "border-primary ring-2 ring-primary ring-offset-1"
          : "border-gray-200 hover:border-primary/50"
      )}
    >
      {/* Background Image - Absolute Full Cover */}
      {cat.image ? (
        <div className="absolute inset-0 z-0">
          <img
            src={(() => {
              let url = cat.image;
              if (url.startsWith("http://")) url = url.replace("http://", "https://");
              if (url.startsWith("/")) url = `${API_BASE_URL}${url}`;
              return url;
            })()}
            alt={cat.Category_name}
            className="w-full h-full object-cover object-center transition-transform duration-500 hover:scale-110"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.classList.add('bg-slate-200');
            }}
          />
          {/* Subtle overlay to ensure badge pop */}
          <div className="absolute inset-0 bg-black/10" />
        </div>
      ) : (
        // Fallback Background
        <div className={cn("absolute inset-0 z-0 flex items-center justify-center bg-slate-100")}>
          <span className="text-2xl mb-6">📁</span>
        </div>
      )}

      {/* Text Badge - Centered Pill with Multi-line Support */}
      <span
        className={cn(
          "relative z-10 text-[10px] font-bold px-2 py-1 rounded-xl shadow-sm backdrop-blur-md transition-colors duration-200",
          "w-[90%] text-center leading-[1.1] whitespace-normal break-words", // multi-line support
          isActive
            ? "bg-primary text-white"
            : "bg-white/95 text-gray-800"
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
