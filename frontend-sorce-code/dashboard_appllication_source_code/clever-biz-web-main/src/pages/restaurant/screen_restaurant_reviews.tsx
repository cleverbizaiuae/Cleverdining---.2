import { DateSearchBox, TextSearchBox } from "@/components/input";
import { TableReviewList } from "@/components/tables";
import { Pagination, StatCardAsteric } from "@/components/utilities";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
import axiosInstance from "@/lib/axios";
import { ReviewItem } from "@/types";
import { useContext, useEffect, useState } from "react";
import toast from "react-hot-toast";

const ScreenRestaurantReviews = () => {
  const { response } = useContext(WebSocketContext);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [cont, setCont] = useState();
  const [stats, setStats] = useState({
    overall_rating: 0,
    today_reviews_count: 0,
    total_reviews_count: 0,
  });

  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [searchDate, setSearchDate] = useState<string>("");
  const [searchOrderId, setSearchOrderId] = useState<string>("");

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const response = await axiosInstance.get(
          `/owners/reviews/?page=${page}&date=${searchDate}&search=${searchOrderId}`
        );
        const { results, count, status } = response.data;
        console.log(results, "results");
        setReviews(results || []);
        setCount(count || 0);
        setStats({
          overall_rating: status?.overall_rating || 0,
          today_reviews_count: status?.today_reviews_count || 0,
          total_reviews_count: status?.total_reviews_count || 0,
        });
      } catch (error) {
        console.error("Failed to load reviews", error);
        toast.error("Failed to load reviews.");
      }
    };
    if (response.type === "review_created") {
      fetchReviews();
    }

    fetchReviews();
  }, [page, searchDate, searchOrderId,response]);

  // Handler for date change (expects Date or null)
  const handleDateChange = (date: Date | null) => {
    if (date) {
      // Format as YYYY-MM-DD
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      setSearchDate(`${yyyy}-${mm}-${dd}`);
      setPage(1);
    } else {
      setSearchDate("");
      setPage(1);
    }
  };

  // Handler for order ID search
  const handleOrderIdChange = (value: string) => {
    setSearchOrderId(value);
    setPage(1);
  };
  console.log(reviews);
  return (
    <div className="flex flex-col">
      {/* Dashboard Cards */}
      <div className="flex flex-col lg:flex-row gap-y-3 lg:gap-y-0 lg:gap-x-3">
        <StatCardAsteric
          label="Overall Rating"
          data={stats.overall_rating.toFixed(1)}
          accentColor="#FFB056"
          gradientStart="#48E03A"
          gradientEnd="#161F42"
        />
        <StatCardAsteric
          label="Reviews Today"
          data={stats.today_reviews_count.toString()}
          accentColor="#FF6561"
          gradientStart="#FFB056"
          gradientEnd="#161F42"
        />
        <StatCardAsteric
          label="Total Reviews"
          data={stats.total_reviews_count.toString()}
          accentColor="#31BB24"
          gradientStart="#EB342E"
          gradientEnd="#161F42"
        />
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-y-2 md:gap-y-0 my-4">
        <h2 className="flex-1 text-2xl text-primary-text">
          Registered Device List
        </h2>
        <div className="flex-1 flex gap-x-4 justify-end">
          <DateSearchBox onDateChange={handleDateChange} />
          <TextSearchBox
            placeholder="Search by Order ID"
            value={searchOrderId}
            onChange={handleOrderIdChange}
          />
        </div>
      </div>

      {/* Review Table */}
      <div className="bg-sidebar p-4 rounded-lg overflow-x-auto">
        <TableReviewList data={reviews} />
        <div className="mt-4 flex justify-center">
          <Pagination
            page={page}
            total={count}
            onPageChange={(newPage) => setPage(newPage)}
          />
        </div>
      </div>
    </div>
  );
};

export default ScreenRestaurantReviews;
