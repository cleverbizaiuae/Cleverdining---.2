import { cn } from "clsx-for-tailwind";

/* Search box */
export const SearchBox = ({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "flex items-center w-full bg-white rounded-lg shadow-sm overflow-hidden",
        className
      )}
    >
      <input
        type="text"
        placeholder="Search Food items"
        className="flex-grow px-4 py-3 text-gray-700 placeholder-gray-400 bg-white focus:outline-none"
        value={value}
        onChange={onChange}
      />
      <div className="w-16 h-14 bg-[#f5f7fe]">
        <span className="h-full w-full text-gray-400 flex justify-center items-center">
          <svg
            width="21"
            height="21"
            viewBox="0 0 21 21"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.08333 15.6667C5.96389 15.6667 4.17033 14.9324 2.70267 13.464C1.235 11.9956 0.500778 10.202 0.500001 8.08333C0.499223 5.96467 1.23344 4.17111 2.70267 2.70267C4.17189 1.23422 5.96544 0.5 8.08333 0.5C10.2012 0.5 11.9952 1.23422 13.4652 2.70267C14.9352 4.17111 15.669 5.96467 15.6667 8.08333C15.6667 8.93889 15.5306 9.74583 15.2583 10.5042C14.9861 11.2625 14.6167 11.9333 14.15 12.5167L20.6833 19.05C20.8972 19.2639 21.0042 19.5361 21.0042 19.8667C21.0042 20.1972 20.8972 20.4694 20.6833 20.6833C20.4694 20.8972 20.1972 21.0042 19.8667 21.0042C19.5361 21.0042 19.2639 20.8972 19.05 20.6833L12.5167 14.15C11.9333 14.6167 11.2625 14.9861 10.5042 15.2583C9.74583 15.5306 8.93889 15.6667 8.08333 15.6667ZM8.08333 13.3333C9.54167 13.3333 10.7814 12.8231 11.8027 11.8027C12.8239 10.7822 13.3341 9.54244 13.3333 8.08333C13.3326 6.62422 12.8223 5.38483 11.8027 4.36517C10.783 3.3455 9.54322 2.83489 8.08333 2.83333C6.62344 2.83178 5.38406 3.34239 4.36517 4.36517C3.34628 5.38794 2.83567 6.62733 2.83333 8.08333C2.831 9.53933 3.34161 10.7791 4.36517 11.8027C5.38872 12.8262 6.62811 13.3364 8.08333 13.3333Z"
              fill="#ADADAD"
            />
          </svg>
        </span>
      </div>
    </div>
  );
};
