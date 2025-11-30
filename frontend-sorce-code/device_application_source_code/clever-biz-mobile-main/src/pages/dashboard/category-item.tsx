import { cn } from "clsx-for-tailwind";

export type CategoryItemType = {
  id: number;
  Category_name: string;
  slug: string;
  image: string;
  parent_category?: number | null;
  level?: number;
  icon?: string;
  icon_image?: string;
};

type Props = {
  cat: CategoryItemType;
  i: number;
  selectedCategory: number | null;
  setSelectedCategory: (ind: number) => void;
};

export const CategoryItem = ({
  cat,
  setSelectedCategory,
  i,
  selectedCategory,
}: Props) => {
  return (
    <div
      key={cat.id}
      onClick={() => setSelectedCategory(i)}
      className={cn(
        "flex-shrink-0 h-40 w-38 truncate bg-sidebar flex flex-col gap-y-4 items-center justify-center rounded-lg shadow-sm py-4 last:mr-4 select-none cursor-pointer",
        {
          "bg-[#F1F5FF] border border-[#ABC1FF]": selectedCategory === i,
        }
      )}
    >
      <div className="h-16 w-16 rounded-xl overflow-hidden">
        <img
          src={(() => {
            if (!cat.image) return "https://placehold.co/100x100?text=No+Image";
            let url = cat.image;
            // Fix double media path
            // url = url.replace("/media/media/", "/media/");
            // Force HTTPS
            if (url.startsWith("http://")) {
              url = url.replace("http://", "https://");
            }
            // Handle relative paths
            if (url.startsWith("/")) {
              url = `https://cleverdining-2.onrender.com${url}`;
            }
            return url;
          })()}
          alt={cat.Category_name}
          className="object-cover w-full h-full"
          onError={(e) => {
            e.currentTarget.src = "https://placehold.co/100x100?text=No+Image";
          }}
        />
      </div>
      <p className="text-primary font-medium">{`${cat.Category_name.substring(
        0,
        17
      )}`}</p>
    </div>
  );
};
