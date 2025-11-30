import { ChefAvatar } from "../components/icons";

const ScreenHome = () => {
  return (
    <div className="h-screen  flex flex-col justify-between items-center px-1 mt-2 overflow-y-hidden">
      {/* Top section - REMOVED */}

      {/* Chef Avatar */}
      <div className="flex justify-center w-full my-0 sm:my-2">
        <ChefAvatar />
      </div>

      {/* Bottom Section - REMOVED */}
    </div>
  );
};

export default ScreenHome;
