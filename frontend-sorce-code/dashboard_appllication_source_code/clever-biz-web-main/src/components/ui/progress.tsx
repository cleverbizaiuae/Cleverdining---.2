import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

interface ProgressProps
  extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  value?: number;
  max?: number;
  indicatorProps?: React.HTMLAttributes<HTMLDivElement>;
}

function Progress({
  className,
  value = 0,
  max = 100,
  indicatorProps = {},
  ...props
}: ProgressProps) {
  const percentage = Math.min(100, (value / max) * 100);
  const {
    className: indicatorClass,
    style: indicatorStyle,
    ...restIndicatorProps
  } = indicatorProps;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("bg-primary h-full transition-all", indicatorClass)}
        style={{ width: `${percentage}%`, ...indicatorStyle }}
        {...restIndicatorProps}
      />
    </ProgressPrimitive.Root>
  );
}
export { Progress };
