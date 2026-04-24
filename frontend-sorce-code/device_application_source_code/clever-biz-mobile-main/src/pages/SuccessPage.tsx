import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Facebook,
  Instagram,
  Music2,
  Star,
  Twitter,
} from "lucide-react";
import { motion } from "motion/react";
import axiosInstance from "@/lib/axios";
import { useBrandConfig } from "@/lib/useBrandConfig";
import logoImg from "@/assets/icon-32.png";

const SuccessPage = () => {
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const brand = useBrandConfig(restaurantId);

  // Cleanup function - clears ALL session-related state for complete isolation
  const cleanupSession = () => {
    localStorage.removeItem("userInfo");
    localStorage.removeItem("guest_session_token");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("pending_order_id");
    localStorage.removeItem("bulk_checkout");
    // Clear chat/messages state for session isolation
    localStorage.removeItem("chat_messages_cache");
    localStorage.removeItem("newMessage");
    localStorage.removeItem("cart");
  };

  useEffect(() => {
    // Prevent back navigation
    window.history.pushState(null, "", window.location.href);
    window.onpopstate = function () {
      window.history.go(1);
    };

    // Fetch restaurant info including Google Review URL
    const fetchRestaurantInfo = async () => {
      try {
        const orderId = localStorage.getItem("pending_order_id");
        const guestToken = localStorage.getItem("guest_session_token");

        if (orderId && guestToken) {
          // Fetch order to get restaurant info
          const res = await axiosInstance.get(`/api/customer/uncomplete/orders/${orderId}/`, {
            headers: { "X-Guest-Session-Token": guestToken },
          });

          if (res.data) {
            setRestaurantName(res.data.restaurant_name || "");
            const resolvedRestaurantId =
              res.data.restaurant_id ??
              res.data.restaurant ??
              res.data?.restaurant_details?.id ??
              null;
            if (resolvedRestaurantId !== null && resolvedRestaurantId !== undefined) {
              setRestaurantId(String(resolvedRestaurantId));
            }
            // The restaurant google_review_url should be included in order response
            // If not, we need to add it to the order serializer
            setGoogleReviewUrl(res.data.restaurant_google_review_url || res.data.google_review_url || null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch restaurant info:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurantInfo();

    // Auto cleanup after delay (session ends)
    const timer = setTimeout(() => {
      cleanupSession();
    }, 120000); // 2 minutes

    return () => clearTimeout(timer);
  }, []);

  const resolvedRestaurantName = useMemo(() => {
    const remoteName = (brand.restaurantName || "").trim();
    if (remoteName && remoteName !== "My Restaurant") return remoteName;
    return restaurantName || "Restaurant";
  }, [brand.restaurantName, restaurantName]);

  const resolvedGoogleReviewUrl = brand.googleReviewUrl || googleReviewUrl;
  const primaryColor = brand.primaryColor || "#0055FE";

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
    cleanupSession();

    // Open in new tab/window (external)
    window.open(resolvedGoogleReviewUrl, "_blank", "noopener,noreferrer");
  };

  const overlayClass =
    brand.themePreset === "luxury_dark"
      ? "bg-gradient-to-b from-black/80 to-black/30"
      : brand.themePreset === "warm_casual"
        ? "bg-gradient-to-b from-black/40 via-amber-900/20 to-transparent"
        : "bg-gradient-to-b from-black/50 to-transparent";

  return (
    <div className="flex flex-col min-h-screen w-full bg-gray-50 items-center justify-center sm:p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full h-full sm:h-auto sm:max-w-md bg-white sm:rounded-3xl sm:shadow-xl sm:border sm:border-slate-100 flex flex-col overflow-y-auto sm:overflow-visible"
      >
        {brand.coverImageUrl ? (
          <div className="relative h-52 w-full overflow-hidden">
            <img src={brand.coverImageUrl} alt={`${resolvedRestaurantName} cover`} className="h-52 w-full object-cover" />
            <div className={`absolute inset-0 ${overlayClass}`} />
          </div>
        ) : (
          <div className="h-52 w-full bg-gray-50" />
        )}

        <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-6 py-8">
          {/* Restaurant branding slot */}
          <div className="mb-6">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={`${resolvedRestaurantName} logo`} className="h-16 w-auto object-contain mx-auto" />
            ) : (
              <p className="text-2xl font-bold text-center" style={{ color: primaryColor }}>
                {resolvedRestaurantName}
              </p>
            )}
          </div>

          {/* Success Icon */}
          <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <CheckCircle2 size={48} className="text-green-500" strokeWidth={2.5} />
            </motion.div>
          </div>

          <p className="text-[11px] tracking-[0.16em] uppercase text-slate-400 font-semibold mb-2 text-center">
            {resolvedRestaurantName}
          </p>

          {/* Main Title */}
          <h1 className="text-2xl font-bold mb-3 text-center" style={{ color: primaryColor }}>
            Thank You
          </h1>

          {/* Supporting Text */}
          <p className="text-slate-500 text-sm mb-6 text-center leading-relaxed max-w-[90%] italic">
            {brand.tagline || "We hope you enjoyed your meal. See you again soon!"}
          </p>

          {/* Google Review Section - Only show if URL is configured */}
          {!loading && resolvedGoogleReviewUrl && (
            <div className="w-full max-w-sm border border-slate-200 rounded-2xl p-4 mb-5" data-testid="google-review-card">
              <div className="flex items-center justify-center gap-1 mb-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} className="w-4 h-4 fill-amber-400 text-amber-400" strokeWidth={1.8} />
                ))}
              </div>
              <p className="text-slate-600 text-sm mb-4 text-center leading-relaxed">
                Please leave a quick Google review and share your experience with others.
              </p>
              <button
                onClick={handleGoogleReview}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white transition-all duration-200 shadow-sm hover:shadow-md hover:brightness-95 active:scale-[0.98]"
                style={{ backgroundColor: primaryColor }}
                data-testid="google-review-button"
              >
                <span>Leave a Google Review</span>
                <ExternalLink className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
          )}

          {/* Fallback message if no Google Review URL configured */}
          {!loading && !resolvedGoogleReviewUrl && (
            <p className="text-slate-400 text-sm text-center mt-2 mb-4">Thank you for your visit!</p>
          )}

          {/* Social links */}
          {socialLinks.length > 0 && (
            <div className="flex items-center justify-center gap-3 mt-1 mb-4">
              {socialLinks.map(({ key, label, href, Icon }) => (
                <a
                  key={key}
                  href={href || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-10 h-10 rounded-full border border-transparent flex items-center justify-center transition-transform active:scale-95"
                  style={{ backgroundColor: `${primaryColor}1a`, color: primaryColor }}
                  data-testid={`social-link-${key}`}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.8} />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-xs text-gray-400">Powered by</span>
            <img src={logoImg} alt="Cleverbiz AI" className="h-4 w-auto opacity-60" />
            <span className="text-xs text-gray-400">Cleverbiz AI</span>
          </div>
          <p className="text-xs text-gray-400">Scan QR code to start a new session</p>
        </div>
      </motion.div>
    </div>
  );
};

export default SuccessPage;
