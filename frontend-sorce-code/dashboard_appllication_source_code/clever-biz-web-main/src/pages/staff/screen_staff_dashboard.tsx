import { useEffect, useState } from "react";
import { useStaff } from "@/context/staffContext";
import { DashboardDropDown } from "../../components/input";
import {
  DashboardCard,
  Pagination,
  TableFoodList,
} from "../../components/utilities";
import { useOwner } from "@/context/ownerContext";

const ScreenStaffDashboard = () => {
  const {
    foodItems,
    foodItemsCount,
    currentPage,
    searchQuery,
    fetchFoodItems,
    setCurrentPage,
  } = useOwner();

  const { statusSummary, fetchStatusSummary } = useStaff();
  console.log(statusSummary, "status summary");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Check authentication status
        const token = localStorage.getItem("accessToken");

        if (!token) {
          setError("No authentication token found");
          return;
        }

        await Promise.all([fetchStatusSummary(), fetchFoodItems()]);
      } catch (err) {
        console.error("Dashboard load error:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchStatusSummary, fetchFoodItems]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchFoodItems(page, searchQuery);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500 text-lg">{error}</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col">
        {/* Dashboard Cards */}
        <div className="flex flex-col lg:flex-row gap-y-3 lg:gap-y-0 lg:gap-x-3">
          {/* Card 1 */}
          <DashboardCard
            label="Available items"
            data={statusSummary?.available_items_count?.toString() || "0"}
            accentColor="#31BB24"
            gradientStart="#48E03A"
            gradientEnd="#161F42"
          />
          {/* Card 2 */}
          <DashboardCard
            label="Processing order"
            data={statusSummary?.processing_orders_count?.toString() || "0"}
            accentColor="#FFB056"
            gradientStart="#FFB056"
            gradientEnd="#161F42"
          />
          {/* Card 3 */}
          <DashboardCard
            label="Pending order"
            data={statusSummary?.pending_orders_count?.toString() || "0"}
            accentColor="#FF6561"
            gradientStart="#EB342E"
            gradientEnd="#161F42"
          />
        </div>
        {/* Dashboard Content */}
        {/* Header and dropdown */}
        <div className="flex flex-row justify-between items-center my-3">
          <h2 className="text-2xl text-primary-text">List of items</h2>
          {/* <DashboardDropDown
            options={["All", "Fruits", "Vegetables", "Dairy", "Meat", "Snacks"]}
          /> */}
        </div>
        {/* List of content */}
        <div className="bg-white border border-slate-200 p-4 rounded-lg">
          <TableFoodList data={foodItems} />
          <div className="mt-4 flex justify-center">
            <Pagination
              page={currentPage}
              total={foodItemsCount}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default ScreenStaffDashboard;
