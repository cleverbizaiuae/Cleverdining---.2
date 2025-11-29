import { cn } from "clsx-for-tailwind";
export type FoodItemTypes = {
  id: number;
  item_name: string;
  price: string;
  description: string;
  slug: string;
  category: number;
  restaurant: number;
  category_name: string;
  image1: string;
  availability: boolean;
  video: string;
  restaurant_name: string;
};

type Props = {
  item: FoodItemTypes;
  showFood: (id: number) => void;
};

export const FoodItems = ({ item, showFood }: Props) => {
  return (
    <>
      {item.availability && (
        <div
          onClick={() => showFood(item.id)}
          className={cn(
            "bg-sidebar flex flex-col items-start justify-between rounded-xl shadow-md p-4 select-none cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02]",
            "w-[300px] sm:w-[220px] md:w-[220px] lg:w-[200px] xl:w-[250px] h-[330px]"
          )}
        >
          <div className="w-full h-[200px] rounded-lg overflow-hidden flex justify-center items-center bg-[#f9f9f9]">
            <img
              src={(() => {
                if (!item.image1) return "https://placehold.co/200x200?text=No+Image";
                let url = item.image1;
                // Fix double media path
                url = url.replace("/media/media/", "/media/");
                // Force HTTPS
                if (url.startsWith("http://")) {
                  url = url.replace("http://", "https://");
                }
                return url;
              })()}
              alt={item.item_name}
              className="object-cover w-full h-full transition-transform duration-500 hover:scale-110"
              onError={(e) => {
                e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
              }}
            />
          </div>

          <p className="text-icon-active/80 font-medium mt-1 text-base truncate w-full ">
            {item?.item_name.substring(0, 29)}
          </p>

          <p className="text-icon-active text-start font-bold text-lg mt-1 truncate">
            AED {item.price}
            <span className="text-sm font-normal text-gray-400 ml-1 truncate">
              / {`${item.category_name.substring(0, 6)}`}
            </span>
          </p>
        </div>
      )}
    </>
  );
};
