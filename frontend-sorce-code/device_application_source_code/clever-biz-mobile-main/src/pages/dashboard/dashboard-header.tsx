import { Logo } from "@/components/icons/logo";
import { SearchBox } from "@/components/input";
import { OutletSheet } from "./outlet-sheet";

type Props = {
  tableName: string;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
};

export const DashboardHeader = ({
  tableName,
  isMobileMenuOpen,
  search,
  setSearch,
  setIsMobileMenuOpen,
}: Props) => {
  return (
    <div>
      <header className="bg-background fixed right-0 top-0 left-0 lg:me-[30%] h-24 flex items-center justify-between px-8 gap-x-16 z-10 ">
        <div className="block">
          <Logo />
        </div>
        <SearchBox
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <div className="flex items-center gap-x-4">
          <div className="flex flex-col items-center">
            <div className="h-10 w-10 bg-accent/5 rounded-full flex justify-center items-center">
              <h2 className="font-bold text-lg text-accent">{tableName}</h2>
            </div>
            <h6 className="text-xs uppercase font-medium text-icon-active">
              Table No
            </h6>
          </div>
          <OutletSheet
            open={isMobileMenuOpen}
            onOpenChange={setIsMobileMenuOpen}
          />
        </div>
      </header>
    </div>
  );
};
