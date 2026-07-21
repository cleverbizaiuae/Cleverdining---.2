import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Facebook,
  CheckCircle2,
  Instagram,
  Music2,
  RefreshCw,
  Star,
  Twitter,
} from "lucide-react";
import { FONT_PRESETS, useBrandConfig } from "@/lib/useBrandConfig";
import { cachedGet } from "@/lib/requestCache";
import axiosInstance from "@/lib/axios";
import logoImg from "@/assets/icon-32.png";
import { useNavigate } from "react-router-dom";

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
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

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(0, 85, 254, ${alpha})`;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const cleanupSessionStorage = () => {
  localStorage.removeItem("userInfo");
  localStorage.removeItem("guest_session_token");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("pending_order_id");
  localStorage.removeItem("bulk_checkout");
  localStorage.removeItem("last_paid_restaurant_id");
  localStorage.removeItem("chat_messages_cache");
  localStorage.removeItem("newMessage");
  localStorage.removeItem("cart");
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
    return {
      sessionId: stripeSessionId || transactionId,
      checkoutSessionId,
      orderId,
      hasGatewayReference: Boolean(stripeSessionId || checkoutSessionId || transactionId),
    };
  }, []);
  const [paymentVerified, setPaymentVerified] = useState(!paymentParams.hasGatewayReference);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationRetry, setVerificationRetry] = useState(0);
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [restaurantId, setRestaurantId] = useState<string | null>(() => resolveStoredRestaurantId());
  const brand = useBrandConfig(restaurantId);
  const coverImage = useDecodedImage(brand.coverImageUrl);
  const logoImage = useDecodedImage(brand.logoUrl);
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
    // Prevent back navigation
    const handlePopState = () => {
      window.history.go(1);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    // Fetch restaurant info including Google Review URL
    const fetchRestaurantInfo = async () => {
      try {
        const orderId = paymentParams.orderId || localStorage.getItem("pending_order_id");
        const guestToken = localStorage.getItem("guest_session_token");

        if (orderId && guestToken) {
          // Fetch order to get restaurant info
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
            // The restaurant google_review_url should be included in order response
            // If not, we need to add it to the order serializer
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
    if (!paymentVerified || sessionCleanedRef.current) return;
    sessionCleanedRef.current = true;
    cleanupSessionStorage();
  }, [paymentVerified]);

  const resolvedRestaurantName = useMemo(() => {
    const remoteName = (brand.restaurantName || "").trim();
    if (remoteName && remoteName !== "My Restaurant") return remoteName;
    return restaurantName || "Restaurant";
  }, [brand.restaurantName, restaurantName]);

  const resolvedGoogleReviewUrl = brand.googleReviewUrl || googleReviewUrl;
  const primaryColor = brand.primaryColor || "#0055FE";
  const fontFamily = FONT_PRESETS.find((font) => font.value === brand.fontPreset)?.family || FONT_PRESETS[0].family;
  const backgroundGradient =
    brand.themePreset === "luxury_dark"
      ? "linear-gradient(160deg, #0f0f0f 0%, #1a1a2e 100%)"
      : brand.themePreset === "warm_casual"
        ? "linear-gradient(160deg, #7c2d12 0%, #c2410c 100%)"
        : `linear-gradient(160deg, ${hexToRgba(primaryColor, 0.87)} 0%, ${primaryColor} 100%)`;

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

  const handleGoogleReview = () => {
    if (!resolvedGoogleReviewUrl) {
      // No URL configured - don't do anything
      return;
    }

    // Cleanup session before leaving
    cleanupSessionStorage();

    // Open in new tab/window (external)
    window.open(resolvedGoogleReviewUrl, "_blank", "noopener,noreferrer");
  };

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

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950">
      <div className="fixed inset-0" style={{ background: backgroundGradient }} />
      {coverImage.readySrc ? (
        <>
          <div
            className="fixed inset-0 scale-[1.08] bg-cover bg-center opacity-80 blur-[14px] transition-opacity duration-500 sm:blur-[18px]"
            style={{ objectPosition: "center top" }}
            aria-hidden="true"
          >
            <div
              className="h-full w-full bg-cover bg-center"
              style={{
                backgroundImage: `url(${coverImage.readySrc})`,
                backgroundPosition: "center top",
              }}
            />
          </div>
          <img
            src={coverImage.readySrc}
            alt={`${resolvedRestaurantName} cover`}
            decoding="async"
            fetchPriority="high"
            className="fixed inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500"
            style={{ objectPosition: "center top", opacity: 0.55 }}
          />
        </>
      ) : null}
      <div
        className="fixed inset-0"
        style={{
          background:
            brand.themePreset === "luxury_dark"
              ? "linear-gradient(to bottom, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.86) 52%, rgba(0,0,0,0.94) 100%)"
              : brand.themePreset === "warm_casual"
                ? "linear-gradient(to bottom, rgba(67,24,8,0.50) 0%, rgba(31,15,8,0.78) 52%, rgba(14,9,6,0.92) 100%)"
                : "linear-gradient(to bottom, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.74) 54%, rgba(0,0,0,0.90) 100%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen w-full flex-col overflow-y-auto px-6 py-8 text-white">
        <div className="flex flex-1 flex-col items-center justify-center min-h-[calc(100vh-112px)] py-8">
          {/* Restaurant branding slot */}
          <div className="mb-5">
            {logoImage.readySrc ? (
              <div
                className="h-20 w-20 mx-auto rounded-[1.25rem] flex items-center justify-center p-1 shadow-2xl shadow-black/40"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.22)",
                }}
              >
                <img
                  src={logoImage.readySrc}
                  alt={`${resolvedRestaurantName} logo`}
                  decoding="async"
                  className="h-full w-full rounded-2xl object-contain bg-transparent"
                />
              </div>
            ) : (
              <div
                className="h-20 w-20 mx-auto rounded-[1.25rem] flex items-center justify-center shadow-2xl shadow-black/40"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.22)",
                }}
              >
                <span className="text-white font-bold text-3xl" style={{ fontFamily }}>
                  {(resolvedRestaurantName || "R")[0]}
                </span>
              </div>
            )}
          </div>

          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-10 w-10 text-green-400" strokeWidth={1.8} />
          </div>

          {/* Main Title */}
          <h1
            className="text-4xl font-bold mb-3 text-center text-white"
            style={{ fontFamily, letterSpacing: "-0.02em" }}
          >
            Order Placed!
          </h1>

          {/* Supporting Text */}
          <p className="text-white/72 text-sm mb-6 text-center leading-relaxed max-w-sm italic">
            {brand.tagline || "Your food is on its way. We hope you enjoy your meal."}
          </p>

          {/* Google Review Section */}
          <div className="w-full max-w-sm border border-white/15 bg-white/12 rounded-3xl p-4 mb-5 shadow-2xl shadow-black/20 backdrop-blur-md" data-testid="google-review-card">
            <div className="flex items-center justify-center gap-1 mb-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="w-4 h-4 fill-amber-400 text-amber-400" strokeWidth={1.8} />
              ))}
            </div>
            <p className="text-white/72 text-sm mb-4 text-center leading-relaxed">
              Please leave a quick Google review and share your experience with others.
            </p>
            {resolvedGoogleReviewUrl && (
              <button
                onClick={handleGoogleReview}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white transition-all duration-200 shadow-sm hover:shadow-md hover:brightness-95 active:scale-[0.98]"
                style={{ backgroundColor: primaryColor }}
                data-testid="google-review-button"
              >
                <span>Leave a Review on Google</span>
                <ExternalLink className="w-4 h-4" strokeWidth={1.8} />
              </button>
            )}
          </div>

          {/* Social links */}
          {socialLinks.length > 0 && (
            <div className="mt-1 mb-4 text-center">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Follow Us</p>
              <div className="flex items-center justify-center gap-3">
              {socialLinks.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-11 h-11 rounded-xl border border-white/15 flex items-center justify-center transition-transform active:scale-95 backdrop-blur-md"
                  style={{ background: "rgba(255,255,255,0.12)", color: "white" }}
                  data-testid={`social-link-${key}`}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.8} />
                </a>
              ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-2 py-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <img src={logoImg} alt="CleverBiz AI" className="h-4 w-auto opacity-60" />
            <span className="text-xs text-white/45">Powered by CleverBiz AI</span>
          </div>
          <p className="text-xs text-white/40">Scan QR code to start a new session</p>
        </div>
      </div>
    </div>
  );
};

export default SuccessPage;
