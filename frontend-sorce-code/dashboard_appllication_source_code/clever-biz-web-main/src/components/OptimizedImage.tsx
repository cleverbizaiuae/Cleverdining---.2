import { memo, type ImgHTMLAttributes, useState } from "react";
import { resolveMediaUrl } from "@/lib/media";

type OptimizedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallbackSrc?: string;
  eager?: boolean;
};

export const OptimizedImage = memo(function OptimizedImage({
  src,
  fallbackSrc,
  eager = false,
  loading,
  decoding = "async",
  onError,
  ...props
}: OptimizedImageProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveMediaUrl(failed ? fallbackSrc : src, fallbackSrc);

  return (
    <img
      {...props}
      src={resolvedSrc}
      loading={loading ?? (eager ? "eager" : "lazy")}
      decoding={decoding}
      fetchPriority={eager ? "high" : "low"}
      onError={(event) => {
        onError?.(event);
        setFailed(true);
      }}
    />
  );
});
