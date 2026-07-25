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
import { clearGuestSessionStorage } from "@/lib/guestSessionStorage";

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
    clearGuestSessionStorage();

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
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 p-4 text-center sm:p-6">
      <main
        className="flex w-full max-w-sm flex-col items-center rounded-3xl border border-slate-100 bg-white p-6 shadow-xl sm:p-8"
        style={{ fontFamily }}
      >
        {logoImage.readySrc ? (
          <img
            src={logoImage.readySrc}
            alt={`${resolvedRestaurantName} logo`}
            decoding="async"
            className="mb-5 h-16 w-16 rounded-2xl object-contain"
          />
        ) : (
          <p className="mb-5 text-lg font-bold" style={{ color: primaryColor }}>
            {resolvedRestaurantName}
          </p>
        )}

        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-11 w-11 text-green-600" strokeWidth={2.5} />
        </div>

        <h1 className="mb-2 text-2xl font-bold text-slate-900">Thank You!</h1>
        <p className="mb-6 text-sm leading-relaxed text-slate-500 sm:text-base">
          Thank you for dining with us today. We hope everything was delicious. See you again soon!
        </p>

        <section
          className="mb-5 w-full rounded-2xl border border-slate-200 p-4"
          data-testid="google-review-card"
        >
          <div className="mb-3 flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star key={index} className="h-5 w-5 fill-amber-400 text-amber-400" strokeWidth={1.8} />
            ))}
          </div>
          <p className="mb-4 text-sm leading-relaxed text-slate-600">
            Please leave a quick Google review and share your experience with others.
          </p>
          {resolvedGoogleReviewUrl ? (
            <button
              type="button"
              onClick={handleGoogleReview}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.98]"
              style={{ backgroundColor: primaryColor }}
              data-testid="google-review-button"
            >
              Leave a Review on Google
              <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
            </button>
          ) : (
            <p className="text-sm font-medium text-slate-500">Thank you for your visit!</p>
          )}
        </section>

        {socialLinks.length > 0 && (
          <div className="mb-5 text-center">
            <p className="mb-3 text-xs font-semibold uppercase text-slate-400">Follow Us</p>
            <div className="flex items-center justify-center gap-3">
              {socialLinks.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 transition-transform active:scale-95"
                  style={{ color: primaryColor }}
                  data-testid={`social-link-${key}`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </a>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => window.location.assign("/login")}
          className="mb-5 min-h-12 w-full rounded-xl bg-slate-900 px-4 font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Back to Home
        </button>

        <div className="flex items-center justify-center gap-2 border-t border-slate-100 pt-5">
          <img src={logoImg} alt="" className="h-4 w-4 opacity-50" />
          <span className="text-xs text-slate-400">Powered by CleverBiz AI</span>
        </div>
      </main>
    </div>
  );
};

export default SuccessPage;
