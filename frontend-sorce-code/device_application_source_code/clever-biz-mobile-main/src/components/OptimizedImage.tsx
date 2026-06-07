import { memo, useState, type ImgHTMLAttributes } from "react";
import { cn } from "clsx-for-tailwind";
import { PLACEHOLDER_IMAGE_URL, resolveMediaUrl } from "../lib/media";

type OptimizedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "loading" | "decoding"> & {
  src?: string | null;
  fallbackSrc?: string;
  eager?: boolean;
};

function OptimizedImageBase({
  src,
  fallbackSrc = PLACEHOLDER_IMAGE_URL,
  eager = false,
  className,
  onError,
  ...props
}: OptimizedImageProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = failed ? fallbackSrc : resolveMediaUrl(src, fallbackSrc);

  return (
    <img
      {...props}
      src={resolvedSrc}
      className={cn("bg-slate-100", className)}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "low"}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}

export const OptimizedImage = memo(OptimizedImageBase);
