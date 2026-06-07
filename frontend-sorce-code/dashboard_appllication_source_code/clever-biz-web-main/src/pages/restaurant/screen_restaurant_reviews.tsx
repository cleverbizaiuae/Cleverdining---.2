/* eslint-disable @typescript-eslint/no-explicit-any */
import { useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import axiosInstance from "@/lib/axios";
import { cachedGet, invalidateApiCache } from "@/lib/requestCache";
import { getActiveRestaurantCurrency } from "@/lib/utils";
import { ReviewItem } from "@/types";
import toast from "react-hot-toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  MessageSquare,
  Calendar as CalendarIcon,
  Star,
  Eye,
  X,
  RefreshCw,
  Settings,
  ExternalLink,
  Check,
} from "lucide-react";

// --- COMPONENTS ---

// 1. METRIC CARD (Global Standard)
const MetricCard = ({ title, value, icon: Icon, colorClass, bgClass, iconBgClass }: any) => (
  <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{title}</p>
      <h3 className="text-2xl font-semibold text-slate-900">{value}</h3>
    </div>
    <div className={`w-10 h-10 rounded-lg ${iconBgClass} flex items-center justify-center ${colorClass}`}>
      <Icon size={20} />
    </div>
  </div>
);

// 2. GOOGLE REVIEW SETTINGS CARD
const GoogleReviewSettingsCard = () => {
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await cachedGet("/owners/restaurant-settings/", {}, { ttlMs: 60_000 });
      const url = res.data.google_review_url || "";
      setGoogleReviewUrl(url);
      setOriginalUrl(url);
    } catch (error) {
      console.error("Failed to load settings", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axiosInstance.patch("/owners/restaurant-settings/", {
        google_review_url: googleReviewUrl.trim() || null
      });
      invalidateApiCache("restaurant-settings");
      setOriginalUrl(googleReviewUrl);
      toast.success("Google review link saved successfully");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = googleReviewUrl !== originalUrl;

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
          <Settings size={20} className="text-[#0055FE]" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Review Settings</h3>
          <p className="text-sm text-slate-500">Configure where customers leave reviews</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {loading ? (
          <div className="text-sm text-slate-400 py-4 text-center">Loading settings...</div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Google Review URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  placeholder="https://g.page/your-restaurant/review"
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 transition-all"
                />
                {googleReviewUrl && (
                  <a
                    href={googleReviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                This link will appear on the payment success screen. Customers can tap to leave a Google review.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${hasChanges
                  ? "bg-[#0055FE] text-white hover:bg-[#0047D1] shadow-lg shadow-[#0055FE]/20"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
              >
                {saving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Save Review Link
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 3. MODAL
const ReviewDetailModal = ({ isOpen, onClose, review }: { isOpen: boolean, onClose: () => void, review: any }) => {
  const orderId = review?.order_id;
  const { data: orderItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["owner-order-items", orderId],
    enabled: isOpen && !!orderId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await cachedGet(`/owners/orders/${orderId}/?includeItems=true`, {}, { ttlMs: 60_000 });
      return res.data.order_items || [];
    },
  });

  if (!isOpen || !review) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Review Details</h3>
            <p className="text-xs text-slate-500">Feedback from verified order</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* User Info */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE] font-bold text-xl">
              {review.customer_name ? review.customer_name[0].toUpperCase() : "G"}
            </div>
            <div>
              <h4 className="text-slate-900 font-bold text-base">{review.customer_name || "Guest"}</h4>
              <div className="flex items-center gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={14}
                    className={`${s <= (review.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-slate-200"}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Comment */}
          <div className="bg-slate-50 p-4 rounded-lg mb-6 border border-slate-100 relative">
            <div className="absolute top-4 left-2 w-1 h-8 bg-[#0055FE] rounded-full"></div>
            <p className="text-slate-700 italic text-sm pl-2">"{review.comment || "No written comment."}"</p>
          </div>

          {/* Meta Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 border border-slate-100 rounded-lg">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Table</span>
              <span className="text-sm font-semibold text-slate-900">{review.table_name || "N/A"}</span>
            </div>
            <div className="p-3 border border-slate-100 rounded-lg">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Order #</span>
              <span className="text-sm font-semibold text-[#0055FE]">#{review.order_id}</span>
            </div>
            <div className="p-3 border border-slate-100 rounded-lg">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Date</span>
              <span className="text-sm font-semibold text-slate-900">{new Date(review.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Order Items */}
          {review.order_id && (
            <div>
              <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                Order Items
                {loadingItems && <RefreshCw size={12} className="animate-spin text-slate-400" />}
              </h5>
              <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-200">
                {loadingItems ? (
                  <div className="p-4 text-center text-xs text-slate-400">Loading...</div>
                ) : orderItems.length > 0 ? (
                  orderItems.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-500 text-xs">x{item.quantity}</span>
                        <span className="font-medium text-slate-900">{item.item_name}</span>
                      </div>
                      <span className="font-bold text-slate-700">{getActiveRestaurantCurrency()} {item.price}</span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400">No items data</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ScreenRestaurantReviews = () => {
  const { response } = useContext(WebSocketContext) || {};
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState({
    overall_rating: 0,
    today_reviews_count: 0,
    total_reviews_count: 0,
  });
  const [page, setPage] = useState(1);
  const [searchDate, setSearchDate] = useState<Date | null>(null);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchReviews = async (force = false) => {
    setLoading(true);
    try {
      const dateStr = searchDate ? searchDate.toISOString().split('T')[0] : "";
      const endpoint = `/owners/reviews/?page=${page}&date=${dateStr}`;
      const res = await cachedGet(endpoint, {}, { ttlMs: 20_000, force });
      const { results, status } = res.data;

      setReviews(Array.isArray(results) ? results : []);
      setStats({
        overall_rating: status?.overall_rating || 0,
        today_reviews_count: status?.today_reviews_count || 0,
        total_reviews_count: status?.total_reviews_count || 0,
      });
    } catch (error) {
      console.error("Failed to load reviews", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReviews(); }, [page, searchDate]);
  useEffect(() => {
    if (response && response.type === "review_created") fetchReviews(true);
  }, [response]);

  return (
    <div className="flex flex-col gap-6 font-inter max-w-2xl mx-auto mt-8">
      {/* GOOGLE REVIEW SETTINGS */}
      <GoogleReviewSettingsCard />
    </div>
  );
};

export default ScreenRestaurantReviews;
