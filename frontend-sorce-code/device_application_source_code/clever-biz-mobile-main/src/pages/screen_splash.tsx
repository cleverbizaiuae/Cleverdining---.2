import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { FONT_PRESETS, shouldRenderBrandExperience, useActiveBrandConfig } from "@/lib/useBrandConfig";

type SplashState = "splash" | "collapsing" | "done";

function getFontFamily(fontPreset: string): string {
  return FONT_PRESETS.find((font) => font.value === fontPreset)?.family || FONT_PRESETS[0].family;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `rgba(0, 85, 254, ${alpha})`;
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ScreenSplash({
  onComplete,
  sessionKey,
}: {
  onComplete?: () => void;
  sessionKey: string;
}) {
  const timerRef = useRef<number | null>(null);
  const [coverImgFailed, setCoverImgFailed] = useState(false);
  const [logoImgFailed, setLogoImgFailed] = useState(false);
  const brand = useActiveBrandConfig();

  const fallbackRestaurantName = useMemo(() => {
    try {
      const raw = localStorage.getItem("userInfo");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      const restaurant = parsed?.user?.restaurants?.[0];
      if (!restaurant) return "";
      return String(restaurant.resturent_name || restaurant.restaurant_name || "").trim();
    } catch {
      return "";
    }
  }, []);

  const hasBranding = shouldRenderBrandExperience(brand);

  const restaurantName =
    hasBranding && brand.restaurantName
      ? brand.restaurantName
      : hasBranding
        ? fallbackRestaurantName || "My Restaurant"
        : "Welcome";
  const brandLogoUrl = hasBranding ? brand.logoUrl : null;
  const brandCoverUrl = hasBranding ? brand.coverImageUrl : null;
  const brandFontFamily = brand.brandingEnabled ? getFontFamily(brand.fontPreset) : undefined;

  const splashGradient = useMemo(() => {
    if (brand.themePreset === "luxury_dark") {
      return "linear-gradient(160deg, #0f0f0f 0%, #1a1a2e 100%)";
    }
    if (brand.themePreset === "warm_casual") {
      return "linear-gradient(160deg, #7c2d12 0%, #c2410c 100%)";
    }
    return `linear-gradient(160deg, ${hexToRgba(brand.primaryColor, 0.87)} 0%, ${brand.primaryColor} 100%)`;
  }, [brand.primaryColor, brand.themePreset]);

  const [splashState, setSplashState] = useState<SplashState>(() => {
    try {
      return sessionStorage.getItem(sessionKey) ? "done" : "splash";
    } catch {
      return "splash";
    }
  });

  useEffect(() => {
    setCoverImgFailed(false);
  }, [brandCoverUrl]);

  useEffect(() => {
    setLogoImgFailed(false);
  }, [brandLogoUrl]);

  const dismissSplash = useCallback(() => {
    try {
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      // Non-blocking.
    }
    setSplashState("collapsing");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setSplashState("done");
      onComplete?.();
      timerRef.current = null;
    }, 680);
  }, [onComplete, sessionKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (splashState === "done") {
    return null;
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-slate-950"
      initial={{ y: 0 }}
      animate={splashState === "collapsing" ? { y: "-100%" } : { y: 0 }}
      transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
      onClick={dismissSplash}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          dismissSplash();
        }
      }}
    >
      <div className="absolute inset-0" style={{ background: splashGradient }} />
      {brandCoverUrl && !coverImgFailed ? (
        <motion.img
          src={brandCoverUrl}
          alt={`${restaurantName} cover`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "center top" }}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          animate={splashState === "collapsing" ? { scale: 1.035 } : { scale: 1 }}
          transition={{ duration: 0.36, ease: [0.4, 0, 0.2, 1] }}
          onError={() => setCoverImgFailed(true)}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.82) 100%)",
        }}
      />

      <motion.div
        className="relative z-10 h-full flex flex-col"
        initial={{ opacity: 1 }}
        animate={splashState === "collapsing" ? { opacity: 0 } : { opacity: 1 }}
        transition={{ duration: 0.25, ease: "easeIn" }}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.34, delay: 0.06, ease: [0.34, 1.3, 0.64, 1] }}
            className="h-24 w-24 rounded-full shadow-2xl shadow-black/50 flex items-center justify-center overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.22)",
            }}
          >
            {brandLogoUrl && !logoImgFailed ? (
              <img
                src={brandLogoUrl}
                alt={restaurantName}
                className="h-24 w-24 rounded-full object-contain bg-transparent p-1.5"
                width={96}
                height={96}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onError={() => setLogoImgFailed(true)}
              />
            ) : (
              <span className="text-white font-bold text-5xl" style={{ fontFamily: brandFontFamily }}>
                {(restaurantName || "W").charAt(0).toUpperCase()}
              </span>
            )}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, delay: 0.12 }}
            className="mt-5 text-white font-bold leading-tight"
            style={{
              ...(brandFontFamily ? { fontFamily: brandFontFamily } : {}),
              fontSize: "clamp(1.75rem, 6vw, 2.5rem)",
              letterSpacing: "-0.02em",
            }}
          >
            {restaurantName}
          </motion.h1>
          {hasBranding && brand.tagline ? (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.17 }}
              className="mt-3 max-w-xs text-sm leading-relaxed text-white/72"
            >
              {brand.tagline}
            </motion.p>
          ) : null}
        </div>

        <div className="flex flex-col items-center pb-16 px-8">
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.2 }}
            onClick={(event) => {
              event.stopPropagation();
              dismissSplash();
            }}
            className="w-full max-w-xs py-4 rounded-2xl font-bold text-base tracking-tight shadow-2xl shadow-black/40 relative overflow-hidden"
            style={{ background: "rgba(255,255,255,0.95)", color: "#0f172a" }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <span>View Menu</span>
              <ArrowRight className="w-5 h-5" strokeWidth={2.2} />
            </span>
          </motion.button>
          <p className="mt-4 text-white/40 text-xs">Tap anywhere to skip</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
