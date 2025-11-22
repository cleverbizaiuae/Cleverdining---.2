import { ChefAvatar } from "../components/icons";

const ScreenHome = () => {
  return (
    <div className="h-screen  flex flex-col justify-between items-center px-1 mt-2 overflow-y-hidden">
      {/* Top section */}
      <div className="w-full max-w-2xl">
        <div className="flex flex-col gap-y-3 rounded-lg shadow-md bg-[#F6F9FF] p-2  text-primary">
          <h1 className="text-2xl sm:text-3xl md:text-[18px] lg:text[20px] xl:text-4xl font-medium text-left">
            Hi, There
          </h1>
          <h6 className="text-base sm:text-lg md:text-[14px] text-left xl:text-xl">
            Welcome! Thank you for joining us today!
          </h6>
          <p className="text-sm sm:text-base md:text-sm text-primary/60 mt-2 sm:mt-2  text-left xl:text-xl">
            We're so happy to see you! Get ready to indulge in some delicious
            flavors and a warm, friendly atmosphere.
          </p>
        </div>
      </div>

      {/* Chef Avatar */}
      <div className="flex justify-center w-full my-0 sm:my-2">
        <ChefAvatar />
      </div>

      {/* Bottom Section */}
      <div className="w-full max-w-2xl text-center space-y-2 px-2 mb-40">
        <h6 className="text-2xl sm:text-2xl md:text-[12px] xl:text-[18px] text-primary font-medium">
          Select delicious items for your meal
        </h6>
        <p className="text-sm sm:text-base md:text-[10px] xl:text-[14px] text-primary/100">
          Here's our menu—take your time to explore our delicious categories and
          items
        </p>
      </div>
    </div>
  );
};

export default ScreenHome;
