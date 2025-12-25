import { cn } from "clsx-for-tailwind";

interface TimeRangeToggleProps {
    value: string;
    onChange: (value: string) => void;
}

export const TimeRangeToggle = ({ value, onChange }: TimeRangeToggleProps) => {
    const options = [
        { label: "Day", value: "day" },
        { label: "Month", value: "month" },
        { label: "Year", value: "year" },
    ];

    return (
        <div className="flex bg-slate-100 p-1 rounded-lg">
            {options.map((option) => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        "px-3 py-1 text-xs font-medium rounded-md transition-all",
                        value === option.value
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
};
