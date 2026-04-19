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
        "relative flex flex-col items-center justify-center p-1 transition-all duration-200 overflow-hidden",
        "w-[72px] h-[72px] shrink-0 rounded-2xl",
        isActive ? "border-2 border-primary shadow-sm shadow-primary/15" : "border border-gray-200 hover:border-primary/40",
      )}
    >
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
            loading="lazy"
            className="w-full h-full object-cover object-center transition-transform duration-500 hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement?.classList.add("bg-slate-200");
            }}
          />
          <div className="absolute inset-0 bg-black/10" />
        </div>
      ) : (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-slate-100">
          <span className="text-xl">📁</span>
        </div>
      )}

      <span
        className={cn(
          "relative z-10 text-xs font-bold px-1.5 py-1 rounded-lg shadow-sm backdrop-blur-md transition-colors duration-200",
          "w-[90%] text-center leading-[1.1] whitespace-normal break-words",
          isActive ? "bg-primary/95 text-white" : "bg-white/90 text-gray-800",
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

      {isActive ? <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-primary" /> : null}
    </button>
  );
};
