import { useEffect, useState } from "react";

type ProgressBarProps = {
  status: string;
  hasPaid: boolean;
  setHasPaid: React.Dispatch<React.SetStateAction<boolean>>;
};

export const ProgressBar = ({ status, setHasPaid }: ProgressBarProps) => {
  const [currentStatus] = useState(status.toLowerCase());
  const [connectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("disconnected");
  // const { response } = useContext(SocketContext);
  // const [hasPaid, setHasPaid] = useState(status.toLowerCase() === "paid");

  const statusOrder = ["pending", "preparing", "served"];
  const steps = [
    { key: "pending", label: "Pending" },
    { key: "preparing", label: "Preparing" },
    { key: "served", label: "Served" },
  ];
  const currentIndex = Math.max(0, statusOrder.indexOf(currentStatus));
  const progressPercentage = (currentIndex / (statusOrder.length - 1)) * 100;
  if (currentIndex === -1) {
    console.warn(`Status "${currentStatus}" not found in statusOrder array`);
  }

  useEffect(() => {
    if (currentStatus === "paid") {
      setHasPaid(true);
    }
  }, [currentStatus]);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1 ">
        <span className="text-sm font-semibold text-gray-800">
          Order Progress
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm capitalize bg-gray-100 px-2 py-1 rounded-full text-gray-600 ">
            {currentStatus}
          </span>

          <div
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "connecting"
                ? "bg-yellow-500 animate-pulse"
                : connectionStatus === "error"
                ? "bg-red-500"
                : "bg-gray-400"
            }`}
            title={`WebSocket ${connectionStatus}`}
          />
        </div>
      </div>

      {/* Smooth Horizontal Progress */}
      <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden ">
        <div
          className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(0, Math.min(100, progressPercentage))}%`,
            minWidth: progressPercentage > 0 ? "2px" : "0px",
          }}
        />
      </div>

      {/* Milestone Steps */}
      <div className="flex justify-between relative ">
        {steps.map((step) => {
          const stepIndex = statusOrder.indexOf(step.key);
          const isCompleted = stepIndex !== -1 && stepIndex <= currentIndex;

          return (
            <div key={step.key} className="flex flex-col items-center mt-3">
              <div
                className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                  isCompleted
                    ? "bg-green-500 text-white shadow-md scale-110"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                {isCompleted ? "✓" : "•"}
              </div>
              <span
                className={`mt-2 text-[11px] sm:text-xs font-medium text-center max-w-[60px] ${
                  isCompleted ? "text-green-600" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Connection error message */}
      {connectionStatus === "error" && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1">
          <span className="w-1 h-1 bg-red-500 rounded-full"></span>
          Connection issue. Updates may be delayed.
        </div>
      )}

      {/* Connecting message */}
      {connectionStatus === "connecting" && (
        <div className="mt-3 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center gap-1">
          <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></span>
          Connecting to live updates...
        </div>
      )}
    </div>
  );
};
