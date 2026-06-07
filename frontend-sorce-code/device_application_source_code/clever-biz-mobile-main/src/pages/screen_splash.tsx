import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FONT_PRESETS, useBrandConfig } from "@/lib/useBrandConfig";

type SplashState = "splash" | "collapsing" | "done";

const BRAND_SPLASH_SESSION_KEY = "cb_splash_seen";

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

export default function ScreenSplash() {
  const navigate = useNavigate();
  const timerRef = useRef<number | null>(null);
  const [coverImgFailed, setCoverImgFailed] = useState(false);
  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const brand = useBrandConfig(restaurantId);

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

  const hasConfiguredContent = Boolean(
    brand.logoUrl || brand.coverImageUrl || (brand.restaurantName && brand.restaurantName !== "My Restaurant")
  );
  const hasBranding = brand.brandingEnabled || hasConfiguredContent;

  const restaurantName =
    hasBranding && brand.restaurantName
      ? brand.restaurantName
      : fallbackRestaurantName || "Welcome";
  const brandLogoUrl = hasBranding ? brand.logoUrl : null;
  const brandCoverUrl = hasBranding ? brand.coverImageUrl : null;
  const brandFontFamily = getFontFamily(brand.fontPreset);

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
      return sessionStorage.getItem(BRAND_SPLASH_SESSION_KEY) ? "done" : "splash";
    } catch {
      return "splash";
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userInfo");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const nextRestaurantId = parsed?.user?.restaurants?.[0]?.id;
      if (nextRestaurantId) {
        setRestaurantId(nextRestaurantId);
      }
    } catch {
      // Silent fallback.
    }
  }, []);

  useEffect(() => {
    setCoverImgFailed(false);
  }, [brandCoverUrl]);

  const dismissSplash = useCallback(() => {
    try {
      sessionStorage.setItem(BRAND_SPLASH_SESSION_KEY, "1");
    } catch {
      // Non-blocking.
    }
    setSplashState("collapsing");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setSplashState("done");
      timerRef.current = null;
    }, 520);
  }, []);

  useEffect(() => {
    if (splashState === "done") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, splashState]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (splashState === "done") {
    return <div className="h-screen w-screen bg-slate-950" />;
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950"
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
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${brandCoverUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(18px)",
              transform: "scale(1.1)",
            }}
          />
          <motion.img
            src={brandCoverUrl}
            alt={`${restaurantName} cover`}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "center top" }}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            initial={{ opacity: 0.45, scale: 1 }}
            animate={splashState === "collapsing" ? { opacity: 0.55, scale: 1.06 } : { opacity: 0.55, scale: 1 }}
            transition={{ duration: 0.48, ease: [0.4, 0, 0.2, 1] }}
            onError={() => setCoverImgFailed(true)}
          />
        </>
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
        initial={{ opacity: 1, y: 0 }}
        animate={splashState === "collapsing" ? { opacity: 0, y: -16 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.4, 0, 1, 1] }}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            className="h-24 w-24 rounded-full shadow-2xl shadow-black/50 flex items-center justify-center overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.22)",
            }}
          >
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt={restaurantName}
                className="h-24 w-24 rounded-full object-contain bg-transparent p-1.5"
                width={96}
                height={96}
                loading="eager"
                decoding="async"
                fetchPriority="high"
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
            transition={{ duration: 0.55, delay: 0.32 }}
            className="mt-5 text-white font-bold leading-tight"
            style={{
              fontFamily: brandFontFamily,
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
              transition={{ duration: 0.55, delay: 0.42 }}
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
            transition={{ duration: 0.55, delay: 0.5 }}
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
    </div>
  );
}
