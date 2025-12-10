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
  User,
  X,
  RefreshCw,
  ShoppingBag
} from "lucide-react";

// --- COMPONENTS ---

const MetricCard = ({ title, value, subtext }: any) => (
  <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-start justify-between h-full hover:shadow-md transition-shadow">
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Star className="text-yellow-400 fill-yellow-400" size={14} />
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
      </div>
      <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
    </div>
    <div className="w-10 h-10 rounded-lg bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE]">
      <MessageSquare size={20} />
    </div>
  </div>
);

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
      const res = await axiosInstance.get(`/owners/orders/${orderId}/?includeItems=true`); // Adjust based on actual endpoint structure
      // Assuming res.data.items or similar structure
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
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Review & Order Details</h3>
            <p className="text-xs text-slate-500">Customer feedback and ordered items</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-50 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Customer Header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE] font-bold text-xl">
              {reviewCustomerInitial(review)}
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
          <div className="bg-slate-50 p-4 rounded-lg mb-6 border border-slate-100">
            <p className="text-slate-600 italic text-sm">"{review.comment || "No comment provided"}"</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-slate-100 p-3 rounded-lg">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-medium mb-1">Table</p>
              <p className="text-sm font-bold text-slate-900">{review.table_name || "-"}</p>
            </div>
            <div className="bg-white border border-slate-100 p-3 rounded-lg">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-medium mb-1">Order ID</p>
              <p className="text-sm font-bold text-[#0055FE]">#{review.order_id || "-"}</p>
            </div>
            <div className="bg-white border border-slate-100 p-3 rounded-lg">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-medium mb-1">Date</p>
              <p className="text-sm font-bold text-slate-900">{new Date(review.created_at).toLocaleDateString()}</p>
            </div>
            <div className="bg-white border border-slate-100 p-3 rounded-lg">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-medium mb-1">Status</p>
              <p className="text-sm font-bold text-slate-900">Verified</p>
            </div>
          </div>

          {/* Order Items */}
          {review.order_id && (
            <div>
              <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                Items Ordered
                {loadingItems && <RefreshCw size={12} className="animate-spin text-slate-400" />}
              </h5>
              <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-200">
                {loadingItems ? (
                  <div className="p-4 text-center text-xs text-slate-400">Loading items...</div>
                ) : orderItems.length > 0 ? (
                  orderItems.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-6 h-6 rounded bg-[#0055FE]/10 text-[#0055FE] text-xs font-bold">
                          {item.quantity}x
                        </div>
                        <span className="text-sm text-slate-700 font-medium">{item.item_name}</span>
                      </div>
                      <span className="text-sm text-slate-600 font-medium">${item.price}</span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400">No items found</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper to get initial
const reviewCustomerInitial = (review: any) => {
  if (review.customer_name) return review.customer_name[0].toUpperCase();
  return "G";
}

const ScreenRestaurantReviews = () => {
  const { response } = useContext(WebSocketContext);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState({
    overall_rating: 0,
    today_reviews_count: 0,
    total_reviews_count: 0,
  });

  const [page, setPage] = useState(1);
  const [searchDate, setSearchDate] = useState<Date | null>(null);
  const [selectedReview, setSelectedReview] = useState<any>(null);

  // Fetch
  const fetchReviews = async () => {
    try {
      const dateStr = searchDate ? searchDate.toISOString().split('T')[0] : "";
      const endpoint = `/owners/reviews/?page=${page}&date=${dateStr}`;

      const res = await axiosInstance.get(endpoint);
      const { results, status } = res.data;

      setReviews(results || []);
      setStats({
        overall_rating: status?.overall_rating || 0,
        today_reviews_count: status?.today_reviews_count || 0,
        total_reviews_count: status?.total_reviews_count || 0, // Using total_reviews from api if possible, or calculate from list length if paginated
      });
      // Note: stats from API are preferred, but if count is outside results, use that.
    } catch (error) {
      console.error("Failed to load reviews", error);
      toast.error("Failed to load reviews");
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [page, searchDate]);

  useEffect(() => {
    if (response && response.type === "review_created") {
      fetchReviews();
    }
  }, [response]);

  return (
    <div className="min-h-screen bg-white font-inter">
      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard title="Overall Rating" value={stats.overall_rating.toFixed(1)} />
        <MetricCard title="Reviews Today" value={stats.today_reviews_count} />
        <MetricCard title="Total Reviews" value={stats.total_reviews_count} />
      </div>

      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
        <h2 className="text-lg font-bold text-slate-900">Customer Reviews</h2>

        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <DatePicker
            selected={searchDate}
            onChange={setSearchDate}
            dateFormat="dd/MM/yyyy"
            placeholderText="dd/mm/yyyy"
            className="h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 w-40 cursor-pointer shadow-sm"
          />
        </div>
      </div>

      {/* Review List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        {reviews.length > 0 ? (
          <>
            {/* Desktop Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="col-span-3">Customer</div>
              <div className="col-span-3">Date</div>
              <div className="col-span-2">Table</div>
              <div className="col-span-3">Rating</div>
              <div className="col-span-1 text-right">View</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-100">
              {reviews.map((review: any) => (
                <div key={review.id} className="group md:grid md:grid-cols-12 md:gap-4 md:items-center px-6 py-4 hover:bg-slate-50/50 transition-colors">
                  {/* Mobile Top Row */}
                  <div className="flex justify-between items-start md:hidden mb-2">
                    <span className="font-bold text-slate-900">{review.customer_name || "Guest"}</span>
                    <button
                      onClick={() => setSelectedReview(review)}
                      className="text-[#0055FE] bg-blue-50 p-1.5 rounded-lg"
                    >
                      <Eye size={16} />
                    </button>
                  </div>

                  {/* Columns */}
                  <div className="col-span-3 hidden md:block font-medium text-slate-900">{review.customer_name || "Guest"}</div>

                  <div className="col-span-3 text-xs text-slate-500 md:text-sm md:text-slate-600 flex items-center gap-2">
                    <CalendarIcon size={12} className="md:hidden" />
                    {new Date(review.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>

                  <div className="col-span-2 text-xs text-slate-500 md:text-sm md:text-slate-600 mt-1 md:mt-0">
                    {review.table_name || "-"}
                  </div>

                  <div className="col-span-3 flex items-center gap-0.5 mt-2 md:mt-0">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={14}
                        className={`${s <= (review.rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-slate-200"}`}
                      />
                    ))}
                  </div>

                  <div className="hidden md:block col-span-1 text-right">
                    <button
                      onClick={() => setSelectedReview(review)}
                      className="text-[#0055FE] hover:bg-blue-50 p-1.5 rounded transition-colors"
                    >
                      <Eye size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-slate-400 text-sm">No reviews found</div>
        )}
      </div>

      {/* Pagination */}
      <div className="py-6 flex justify-center">
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-slate-600 self-center border border-transparent">Page {page}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={reviews.length < 10} // Simple check, ideally use total count
            className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600"
          >
            Next
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-6">
        <p className="text-xs text-slate-400">Powered by CleverBiz AI</p>
      </div>

      <ReviewDetailModal isOpen={!!selectedReview} onClose={() => setSelectedReview(null)} review={selectedReview} />
    </div>
  );
};

export default ScreenRestaurantReviews;
