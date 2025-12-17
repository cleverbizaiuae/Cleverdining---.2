import { TableFoodOrderList } from "@/components/tables";
import { TextSearchBox } from "../../components/input";
import { OrderlistCard, Pagination } from "../../components/utilities";
import { useEffect, useState } from "react";
import { useStaff } from "@/context/staffContext";

const ScreenChefOrderList = () => {
  const {
    orders,
    ordersStats,
    ordersCount,
    ordersCurrentPage,
    ordersSearchQuery,
    fetchOrders,
    updateOrderStatus,
    setOrdersCurrentPage,
    setOrdersSearchQuery,
  } = useStaff();
  console.log(ordersCurrentPage, " ordersCurrentPage");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(ordersSearchQuery);
    }, 500); // 500ms delay

    return () => clearTimeout(timer);
  }, [ordersSearchQuery]);

  // Load orders on component mount and when page or debounced search changes
  useEffect(() => {
    fetchOrders(ordersCurrentPage, debouncedSearchQuery);
  }, [ordersCurrentPage, debouncedSearchQuery, fetchOrders]);

  const handlePageChange = (page: number) => {
    setOrdersCurrentPage(page);
  };

  const handleSearch = (query: string) => {
    setOrdersSearchQuery(query);
    setOrdersCurrentPage(1); // Reset to first page when searching
  };

  return (
    <>
      <div className="flex flex-col">
        {/* Dashboard Cards */}
        <div className="flex flex-col lg:flex-row gap-y-3 lg:gap-y-0 lg:gap-x-3">
          {/* Card 1 */}
          <OrderlistCard
            label="Ongoing Order"
            data={
              ordersStats?.ongoing_orders?.toString() ||
              ordersStats?.total_ongoing_orders?.toString() ||
              "0"
            }
            accentColor="#6B8CED"
            gradientStart="#6189FF"
            gradientEnd="#ffffff"
            className="bg-white shadow-xl shadow-gray-200 border border-gray-100"
            textClassName="text-gray-900"
          />
          {/* Card 2 */}
          <OrderlistCard
            label="Completed order"
            data={ordersStats?.total_completed_orders?.toString() || "0"}
            accentColor="#48E03A"
            gradientStart="#48E03A"
            gradientEnd="#ffffff"
            className="bg-white shadow-xl shadow-gray-200 border border-gray-100"
            textClassName="text-gray-900"
          />
        </div>
        {/* Dashboard Content */}
        {/* Header and dropdown */}
        {/* Header and dropdown */}
        <div className="flex flex-row justify-between items-center gap-y-4 md:gap-y-0 my-3">
          <h2 className="flex-1 text-2xl text-gray-900 font-bold">List of items</h2>

          <div className="flex-1 flex gap-x-4 flex-row-reverse md:flex-row justify-end">
            {/* Search box by id */}
            <TextSearchBox
              placeholder="Search by Order ID"
              value={ordersSearchQuery}
              onChange={handleSearch}
              className="w-full max-w-xs"
              inputContainerClassName="bg-white border border-blue-100 shadow-sm text-gray-900 placeholder:text-gray-400"
              buttonClassName="bg-[#0055FE] hover:bg-[#0047D1] text-white"
            />
          </div>
        </div>
        {/* List of content */}
        <div className="bg-white border border-gray-200 shadow-xl shadow-gray-200/50 p-4 rounded-xl">
          <TableFoodOrderList
            data={orders}
            updateOrderStatus={updateOrderStatus}
            headerClassName="bg-[#0055FE] text-white rounded-t-lg"
            bodyClassName="bg-white text-gray-900"
            rowClassName="border-gray-100 hover:bg-blue-50 transition-colors"
          />
          <div className="mt-4 flex justify-center">
            <Pagination
              page={ordersCurrentPage}
              total={ordersCount}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default ScreenChefOrderList;
