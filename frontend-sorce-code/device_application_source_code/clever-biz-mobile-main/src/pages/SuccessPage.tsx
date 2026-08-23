import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  RefreshCw,
  Star,
  Twitter,
} from "lucide-react";
import {
  FONT_PRESETS,
  shouldRenderBrandExperience,
  useBrandConfigResult,
} from "@/lib/useBrandConfig";
import { cachedGet } from "@/lib/requestCache";
import axiosInstance from "@/lib/axios";
import { useNavigate } from "react-router-dom";
import { clearGuestSessionStorage } from "@/lib/guestSessionStorage";

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
};

const hexToRgba = (hex: string, alpha: number): string => {
  const cleaned = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `rgba(0, 85, 254, ${alpha})`;
  }
  const red = parseInt(cleaned.slice(0, 2), 16);
  const green = parseInt(cleaned.slice(2, 4), 16);
  const blue = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const VERIFIED_PAYMENT_STATUSES = new Set([
  "completed",
  "paid",
  "success",
  "succeeded",
  "captured",
  "payment_received",
  "payment_approved",
]);

const FAILED_PAYMENT_STATUSES = new Set([
  "failed",
  "declined",
  "cancelled",
  "canceled",
]);

const CLEVERBIZ_SOCIAL_LINKS = [
  { key: "instagram", label: "CleverBiz on Instagram", href: "https://www.instagram.com/cleverbiz.ai/", Icon: Instagram },
  { key: "facebook", label: "CleverBiz on Facebook", href: "https://www.facebook.com/profile.php?id=61579715625664", Icon: Facebook },
  { key: "twitter", label: "CleverBiz on X", href: "https://x.com/cleverbizai", Icon: Twitter },
  { key: "linkedin", label: "CleverBiz on LinkedIn", href: "https://www.linkedin.com/company/106695347/", Icon: Linkedin },
];

const resolveStoredRestaurantId = (): string | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem("userInfo") || "{}");
    return firstNonEmpty(
      parsed?.user?.restaurants?.[0]?.id,
      parsed?.restaurants?.[0]?.id,
      parsed?.restaurant?.id,
      parsed?.restaurant_id,
      parsed?.restaurantId,
      localStorage.getItem("last_paid_restaurant_id"),
      localStorage.getItem("restaurant_id"),
      localStorage.getItem("restaurantId"),
    );
  } catch {
    return firstNonEmpty(
      localStorage.getItem("last_paid_restaurant_id"),
      localStorage.getItem("restaurant_id"),
      localStorage.getItem("restaurantId"),
    );
  }
};

const useDecodedImage = (src: string | null) => {
  const [state, setState] = useState({
    readySrc: null as string | null,
    failedSrc: null as string | null,
  });

  useEffect(() => {
    if (!src) {
      setState({ readySrc: null, failedSrc: null });
      return;
    }

    let cancelled = false;
    setState({ readySrc: null, failedSrc: null });

    const image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      try {
        await image.decode?.();
      } catch {
        // Some browsers throw if decode is called after load; onload is enough.
      }
      if (!cancelled) {
        setState({ readySrc: src, failedSrc: null });
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setState({ readySrc: null, failedSrc: src });
      }
    };
    image.src = src;

    if (image.complete && image.naturalWidth > 0) {
      image.onload?.(new Event("load"));
    }

    return () => {
      cancelled = true;
    };
  }, [src]);

  return state;
};

const SuccessPage = () => {
  const navigate = useNavigate();
  const paymentParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeSessionId = params.get("session_id");
    const checkoutSessionId = params.get("cko-session-id");
    const transactionId = params.get("transaction_id") || params.get("payment_id");
    const orderId = params.get("order_id");
    const restaurantId = params.get("restaurant_id");
    return {
      sessionId: stripeSessionId || transactionId,
      checkoutSessionId,
      orderId,
      restaurantId,
      hasGatewayReference: Boolean(stripeSessionId || checkoutSessionId || transactionId),
    };
  }, []);
  const [paymentVerified, setPaymentVerified] = useState(!paymentParams.hasGatewayReference);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationRetry, setVerificationRetry] = useState(0);
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [restaurantId, setRestaurantId] = useState<string | null>(
    () => paymentParams.restaurantId || resolveStoredRestaurantId(),
  );
  const { brand } = useBrandConfigResult(
    restaurantId,
    paymentParams.orderId,
  );
  const logoImage = useDecodedImage(brand.logoUrl);
  const coverImage = useDecodedImage(brand.coverImageUrl);
  const sessionCleanedRef = useRef(false);

  useEffect(() => {
    if (!paymentParams.hasGatewayReference) return;
    let cancelled = false;

    const verifySettlement = async () => {
      setVerificationError(null);
      let lastError = "Payment confirmation is taking longer than expected.";

      for (let attempt = 0; attempt < 4 && !cancelled; attempt += 1) {
        try {
          const verifyPayload = paymentParams.checkoutSessionId
            ? { "cko-session-id": paymentParams.checkoutSessionId }
            : { session_id: paymentParams.sessionId };
          const response = await axiosInstance.post("/api/customer/payment/verify/", verifyPayload);
          const remainingAmount = Number(response.data?.remaining_amount || 0);
          if (response.data?.fully_paid === false || remainingAmount > 0) {
            navigate("/dashboard/orders?payment=partial", { replace: true });
            return;
          }

          const paymentStatus = String(
            response.data?.status || response.data?.payment_status || "",
          ).toLowerCase();
          if (response.data?.fully_paid === true || VERIFIED_PAYMENT_STATUSES.has(paymentStatus)) {
            if (!cancelled) setPaymentVerified(true);
            return;
          }
          if (FAILED_PAYMENT_STATUSES.has(paymentStatus)) {
            lastError = "The payment was not completed. Please return to your orders and try again.";
            break;
          }
        } catch (error) {
          console.error("Failed to verify payment settlement:", error);
          lastError = "We could not confirm the payment with the provider yet.";
        }

        if (attempt < 3) {
          await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
        }
      }

      if (!cancelled) setVerificationError(lastError);
    };

    void verifySettlement();
    return () => {
      cancelled = true;
    };
  }, [navigate, paymentParams, verificationRetry]);

  useEffect(() => {
    const handlePopState = () => {
      window.history.go(1);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    const fetchRestaurantInfo = async () => {
      try {
        const orderId = paymentParams.orderId || localStorage.getItem("pending_order_id");
        const guestToken = localStorage.getItem("guest_session_token");

        if (orderId && guestToken) {
          const res = await cachedGet(`/api/customer/uncomplete/orders/${orderId}/`, {
            headers: { "X-Guest-Session-Token": guestToken },
          }, { ttlMs: 2_000 });

          if (res.data) {
            const nextRestaurantName = res.data.restaurant_name || "";
            setRestaurantName((current) => current === nextRestaurantName ? current : nextRestaurantName);
            const resolvedRestaurantId =
              res.data.restaurant_id ??
              res.data.restaurant ??
              res.data?.restaurant_details?.id ??
              null;
            if (resolvedRestaurantId !== null && resolvedRestaurantId !== undefined) {
              const nextRestaurantId = String(resolvedRestaurantId);
              setRestaurantId((current) => current === nextRestaurantId ? current : nextRestaurantId);
            }
            const nextReviewUrl = res.data.restaurant_google_review_url || res.data.google_review_url || null;
            setGoogleReviewUrl((current) => current === nextReviewUrl ? current : nextReviewUrl);
          }
        }
      } catch (error) {
        console.error("Failed to fetch restaurant info:", error);
      }
    };

    void fetchRestaurantInfo();

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [paymentParams.orderId]);

  useEffect(() => {
    if (restaurantId) {
      localStorage.setItem("last_paid_restaurant_id", restaurantId);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!paymentVerified || sessionCleanedRef.current) return;
    sessionCleanedRef.current = true;
    clearGuestSessionStorage();
  }, [paymentVerified]);

  const resolvedRestaurantName = useMemo(() => {
    const remoteName = (brand.restaurantName || "").trim();
    if (remoteName && remoteName !== "My Restaurant") return remoteName;
    return restaurantName || "Restaurant";
  }, [brand.restaurantName, restaurantName]);

  const resolvedGoogleReviewUrl = brand.googleReviewUrl || googleReviewUrl;
  const primaryColor = brand.primaryColor || "#0055FE";
  const fontFamily = FONT_PRESETS.find((font) => font.value === brand.fontPreset)?.family || FONT_PRESETS[0].family;
  const hasBranding = shouldRenderBrandExperience(brand);
  const coverBackground = useMemo(() => {
    if (brand.themePreset === "luxury_dark") {
      return "linear-gradient(145deg, #09090b 0%, #18181b 48%, #27272a 100%)";
    }
    if (brand.themePreset === "warm_casual") {
      return "linear-gradient(145deg, #7c2d12 0%, #c2410c 52%, #fb923c 100%)";
    }
    return `linear-gradient(145deg, ${hexToRgba(primaryColor, 0.72)} 0%, ${primaryColor} 58%, #0f172a 125%)`;
  }, [brand.themePreset, primaryColor]);
  const coverOverlay =
    brand.themePreset === "luxury_dark"
      ? "linear-gradient(to bottom, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.60) 56%, rgba(0,0,0,0.78) 100%)"
      : brand.themePreset === "warm_casual"
        ? "linear-gradient(to bottom, rgba(67,20,7,0.42) 0%, rgba(67,20,7,0.57) 58%, rgba(15,23,42,0.76) 100%)"
        : "linear-gradient(to bottom, rgba(15,23,42,0.38) 0%, rgba(15,23,42,0.52) 58%, rgba(15,23,42,0.76) 100%)";
  const brandAssetsReady =
    (!brand.logoUrl || logoImage.readySrc === brand.logoUrl || logoImage.failedSrc === brand.logoUrl) &&
    (!brand.coverImageUrl || coverImage.readySrc === brand.coverImageUrl || coverImage.failedSrc === brand.coverImageUrl);

  const socialLinks = useMemo(
    () =>
      [
        { key: "instagram", label: "Instagram", href: brand.instagramUrl, Icon: Instagram },
        { key: "facebook", label: "Facebook", href: brand.facebookUrl, Icon: Facebook },
        { key: "twitter", label: "Twitter", href: brand.twitterUrl, Icon: Twitter },
        { key: "tiktok", label: "TikTok", href: brand.tiktokUrl, Icon: Music2 },
      ].filter((social) => social.href),
    [brand.facebookUrl, brand.instagramUrl, brand.tiktokUrl, brand.twitterUrl]
  );

  if (!paymentVerified && verificationError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-3 text-2xl font-semibold">Confirming your payment</h1>
          <p className="mb-6 text-sm leading-relaxed text-white/65">{verificationError}</p>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setVerificationRetry((current) => current + 1)}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 font-semibold text-slate-950"
            >
              <RefreshCw className="h-4 w-4" />
              Retry confirmation
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard/orders", { replace: true })}
              className="min-h-12 rounded-xl border border-white/20 px-4 font-semibold text-white"
            >
              Return to orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!paymentVerified) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Verifying payment" />
      </div>
    );
  }

  if (!brandAssetsReady) {
    return (
      <div
        className="fixed inset-0 isolate flex items-center justify-center overflow-hidden"
        style={{ background: coverBackground, fontFamily }}
        aria-label="Loading restaurant branding"
        data-testid="brand-loading-screen"
      >
        {coverImage.readySrc ? (
          <img
            src={coverImage.readySrc}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            style={{ objectPosition: brand.coverPosition || "50% 50%" }}
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-slate-950/60" />
        <div className="flex flex-col items-center gap-4">
          {logoImage.readySrc ? (
            <img
              src={logoImage.readySrc}
              alt={`${resolvedRestaurantName} logo`}
              className="h-20 w-20 rounded-2xl border border-white/25 bg-white/15 object-contain p-1.5 shadow-xl backdrop-blur-md"
            />
          ) : null}
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative isolate min-h-[100dvh] w-full overflow-x-hidden text-center"
      style={{ background: coverBackground, fontFamily }}
      data-testid="thank-you-page"
    >
      <div className="fixed inset-0 -z-20" style={{ background: coverBackground }} />
      {hasBranding && coverImage.readySrc ? (
        <img
          src={coverImage.readySrc}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="fixed inset-0 -z-10 h-full w-full scale-[1.02] object-cover"
          style={{ objectPosition: brand.coverPosition || "50% 50%" }}
          data-testid="restaurant-cover"
        />
      ) : null}
      <div className="fixed inset-0 -z-10" style={{ background: coverOverlay }} />

      <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center px-4 text-white sm:px-6">
        <div className="flex w-full flex-1 flex-col items-center justify-center py-6 sm:py-8">
          <header className="flex flex-col items-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white/10 p-1.5 shadow-xl shadow-black/35 backdrop-blur-md">
              {logoImage.readySrc ? (
                <img
                  src={logoImage.readySrc}
                  alt={`${resolvedRestaurantName} logo`}
                  decoding="async"
                  className="h-full w-full rounded-xl object-contain"
                  data-testid="restaurant-logo"
                />
              ) : (
                <span className="text-3xl font-bold sm:text-4xl">
                  {resolvedRestaurantName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <p className="mt-2.5 text-lg font-bold leading-tight drop-shadow-md">
              {resolvedRestaurantName}
            </p>
            {brand.tagline ? (
              <p className="mt-1 max-w-xs text-xs text-white/70 drop-shadow">
                {brand.tagline}
              </p>
            ) : null}
          </header>

          <section
            className="mt-4 w-full rounded-2xl border border-white/20 bg-black/25 p-3.5 shadow-xl shadow-black/20 backdrop-blur-md"
            style={{ boxShadow: `0 14px 34px ${hexToRgba(primaryColor, 0.12)}` }}
            data-testid="google-review-card"
          >
            <div className="mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-emerald-200/35 bg-emerald-300/15 shadow-lg shadow-black/25 backdrop-blur-md">
              <CheckCircle2 className="h-7 w-7 text-emerald-300" strokeWidth={2.6} />
            </div>
            <h1 className="mt-2.5 text-[1.45rem] font-bold tracking-tight text-white drop-shadow-lg">
              Thank You!
            </h1>
            <p className="mt-1.5 text-[0.8rem] leading-relaxed text-white/80 drop-shadow-md">
              Thank you for dining with us today. We hope everything was delicious. See you again soon!
            </p>
            <div className="mb-2 mt-4 flex items-center justify-center gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-5 w-5 fill-amber-400 text-amber-400" strokeWidth={1.8} />
              ))}
            </div>
            <p className="mb-3 text-[0.8rem] leading-relaxed text-white/80">
              Please leave a quick Google review and share your experience with others.
            </p>
            {resolvedGoogleReviewUrl ? (
              <a
                href={resolvedGoogleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ backgroundColor: primaryColor }}
                data-testid="google-review-button"
              >
                Leave a Review on Google
                <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
              </a>
            ) : (
              <p className="text-sm font-medium text-white/75">Thank you for your visit!</p>
            )}
          </section>

          {socialLinks.length > 0 && (
            <section className="mt-3.5 text-center" aria-label={`${resolvedRestaurantName} social links`}>
              <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white/65 drop-shadow">
                Follow Us
              </p>
              <div className="flex items-center justify-center gap-2.5">
                {socialLinks.map(({ key, label, href, Icon }) => (
                  <a
                    key={key}
                    href={href || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-lg shadow-black/15 backdrop-blur-md transition-all hover:bg-white/25 active:scale-95"
                    data-testid={`social-link-${key}`}
                  >
                    <Icon className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.8} />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="w-full shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <a
            href="https://cleverbiz.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center text-xs text-white/60 drop-shadow transition-colors hover:text-white/85"
          >
            <span>Powered by CleverBiz AI</span>
          </a>
          <div className="mt-2 flex items-center justify-center gap-3" aria-label="CleverBiz social links">
            {CLEVERBIZ_SOCIAL_LINKS.map(({ key, label, href, Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="text-white/55 drop-shadow transition-colors hover:text-white/80"
                data-testid={`cleverbiz-social-link-${key}`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
};

export default SuccessPage;
