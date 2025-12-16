import { useState } from "react";

export interface Category {
    id: string;
    name: string;
    imageUrl?: string;
    icon?: React.ReactNode;
}

interface HorizontalCategorySelectorProps {
    categories: Category[];
    selectedId?: string;
    onSelect: (id: string) => void;
}

export function HorizontalCategorySelector({
    categories,
    selectedId,
    onSelect,
}: HorizontalCategorySelectorProps) {
    return (
        <div
            className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide pl-4 pr-4"
            style={{
                scrollbarWidth: "none",      /* Firefox */
                msOverflowStyle: "none",     /* IE/Edge */
            }}
        >
            {categories.map((category) => (
                <CategoryCard
                    key={category.id}
                    category={category}
                    isSelected={category.id === selectedId}
                    onClick={() => onSelect(category.id)}
                />
            ))}
        </div>
    );
}

interface CategoryCardProps {
    category: Category;
    isSelected: boolean;
    onClick: () => void;
}

function CategoryCard({ category, isSelected, onClick }: CategoryCardProps) {
    return (
        <button
            onClick={onClick}
            data-testid={`category-card-${category.id}`}
            className={`
        flex flex-col items-center justify-start
        p-2 rounded-xl transition-all duration-200
        ${isSelected
                    ? "bg-[#0055FE] text-white shadow-lg shadow-blue-500/30"
                    : "bg-white text-slate-700 border border-slate-200 hover:border-[#0055FE]/50"
                }
      `}
            style={{
                width: "80px",              /* Fixed width */
                height: "90px",             /* Fixed height */
                flexShrink: 0,              /* Never shrink */
            }}
        >
            {/* Icon Container - Fixed Size */}
            <div
                className={`
          flex items-center justify-center rounded-lg overflow-hidden
          ${isSelected ? "bg-white/20" : "bg-slate-100"}
        `}
                style={{
                    width: "40px",            /* Fixed icon width */
                    height: "40px",           /* Fixed icon height */
                    flexShrink: 0,            /* Never shrink */
                }}
            >
                {category.imageUrl ? (
                    <img
                        src={category.imageUrl}
                        alt={category.name}
                        className="object-cover"
                        style={{
                            width: "100%",
                            height: "100%",
                        }}
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                    />
                ) : category.icon ? (
                    <span className="text-lg">{category.icon}</span>
                ) : (
                    <span className="text-lg">📁</span>
                )}
                {/* Fallback Icon if Image Fails - Added for robustness */}
                <span className="text-lg hidden">📁</span>
            </div>
            {/* Text Container - Constrained */}
            <div
                className="w-full mt-2 px-1"
                style={{
                    flex: 1,
                    overflow: "hidden",
                }}
            >
                <span
                    className={`
            text-[10px] font-medium leading-tight text-center block
            ${isSelected ? "text-white" : "text-slate-700"}
          `}
                    style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        wordBreak: "break-word",
                        width: "100%",
                    }}
                >
                    {category.name}
                </span>
            </div>
        </button>
    );
}
