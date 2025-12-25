/* eslint-disable @typescript-eslint/no-explicit-any */
import { useContext, useEffect, useState } from "react";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import axiosInstance from "@/lib/axios";
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

// 2. MODAL
const ReviewDetailModal = ({ isOpen, onClose, review }: { isOpen: boolean, onClose: () => void, review: any }) => {
  const [loadingItems, setLoadingItems] = useState(false);
  const [orderItems, setOrderItems] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && review?.order_id) {
      fetchOrderItems(review.order_id);
    } else {
      setOrderItems([]);
    }
  }, [isOpen, review]);

  const fetchOrderItems = async (orderId: string) => {
    setLoadingItems(true);
    try {
      const res = await axiosInstance.get(`/owners/orders/${orderId}/?includeItems=true`);
      setOrderItems(res.data.items || []);
    } catch (error) {
      console.error("Failed to load items", error);
    } finally {
      setLoadingItems(false);
    }
  };

  if (!isOpen || !review) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Review Details</h3>
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
                      <span className="font-bold text-slate-700">AED {item.price}</span>
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

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const dateStr = searchDate ? searchDate.toISOString().split('T')[0] : "";
      const endpoint = `/owners/reviews/?page=${page}&date=${dateStr}`;
      const res = await axiosInstance.get(endpoint);
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
    if (response && response.type === "review_created") fetchReviews();
  }, [response]);

  return (
    <div className="flex flex-col gap-6 font-inter">
      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Avg Rating"
          value={stats.overall_rating.toFixed(1)}
          icon={Star}
          colorClass="text-yellow-500"
          bgClass="bg-white"
          iconBgClass="bg-yellow-50"
        />
        <MetricCard
          title="Reviews Today"
          value={stats.today_reviews_count}
          icon={MessageSquare}
          colorClass="text-[#0055FE]"
          bgClass="bg-white"
          iconBgClass="bg-[#0055FE]/10"
        />
        <MetricCard
          title="Total Reviews"
          value={stats.total_reviews_count}
          icon={MessageSquare}
          colorClass="text-[#0055FE]"
          bgClass="bg-white"
          iconBgClass="bg-[#0055FE]/10"
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {/* TOOLBAR */}
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Feedback</h3>
            <p className="text-sm text-slate-500">Customer opinions and ratings</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0055FE]" size={14} />
              <DatePicker
                selected={searchDate}
                onChange={setSearchDate}
                placeholderText="Filter by Date"
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#0055FE] w-32 md:w-40 cursor-pointer"
              />
            </div>
            <button onClick={() => fetchReviews()} className="h-8 w-8 flex items-center justify-center border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Rating</th>
                <th className="px-5 py-3">Comment Summary</th>
                <th className="px-5 py-3">Table</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-xs text-slate-400">Loading feedback...</td></tr>
              ) : reviews.length > 0 ? (
                reviews.map((review: any) => (
                  <tr key={review.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                          {review.customer_name ? review.customer_name[0].toUpperCase() : "G"}
                        </div>
                        <span className="text-sm font-medium text-slate-900">{review.customer_name || "Guest"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} size={12} className={`${s <= (review.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-slate-200"}`} />
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 italic max-w-xs truncate">
                      "{review.comment || "No comment"}"
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600 font-medium">
                      {review.table_name || "N/A"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(review.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => setSelectedReview(review)}
                        className="text-[#0055FE] hover:bg-[#0055FE]/10 p-1.5 rounded transition-colors"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-xs text-slate-400">No reviews found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 flex justify-center">
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600">Previous</button>
            <span className="px-3 py-1 text-xs text-slate-600 self-center">Page {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={reviews.length < 10} className="px-3 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600">Next</button>
          </div>
        </div>
      </div>

      <ReviewDetailModal isOpen={!!selectedReview} onClose={() => setSelectedReview(null)} review={selectedReview} />
      <div className="text-center text-xs text-slate-400 mt-4">Powered by CleverBiz AI</div>
    </div>
  );
};

export default ScreenRestaurantReviews;
