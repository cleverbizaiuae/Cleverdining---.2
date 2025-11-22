import { TableReservationList } from "@/components/tables";
import { DateSearchBox, TextSearchBox } from "../../components/input";
import { Pagination, StatCard } from "../../components/utilities";
import { useEffect, useState } from "react";
import { useOwner } from "@/context/ownerContext";

// Helper function to get current month name
const getCurrentMonthName = (): string => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return months[new Date().getMonth()];
};

/* Screen to list of reservations on staff end */
const ScreenStaffReservations = () => {
  const {
    reservations,
    reservationsCount,
    reservationsCurrentPage,
    reservationsSearchQuery,
    reservationStatusReport,
    fetchReservations,
    fetchReservationStatusReport,
    setReservationsCurrentPage,
    setReservationsSearchQuery,
  } = useOwner();

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Helper function to format date properly for API
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    const dateString = selectedDate
      ? formatDateForAPI(selectedDate)
      : undefined;
    fetchReservationStatusReport();
    fetchReservations(
      reservationsCurrentPage,
      reservationsSearchQuery,
      dateString
    );
  }, [
    fetchReservationStatusReport,
    fetchReservations,
    reservationsCurrentPage,
    reservationsSearchQuery,
    selectedDate,
  ]);

  const handlePageChange = (page: number) => {
    setReservationsCurrentPage(page);
    const dateString = selectedDate
      ? formatDateForAPI(selectedDate)
      : undefined;
    fetchReservations(page, reservationsSearchQuery, dateString);
  };

  const handleSearchChange = (query: string) => {
    setReservationsSearchQuery(query);
    const dateString = selectedDate
      ? formatDateForAPI(selectedDate)
      : undefined;
    fetchReservations(1, query, dateString);
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    const dateString = date ? formatDateForAPI(date) : undefined;
    fetchReservations(1, reservationsSearchQuery, dateString);
  };
  console.log(reservations);
  return (
    <>
      <div className="flex flex-col">
        {/* Stats Cards */}
        <div className="flex flex-col md:flex-row gap-6">
          <StatCard
            count={
              reservationStatusReport?.total_active_accepted_reservations || 0
            }
            label="Active booking"
            barColor="#4F46E5"
            accentColor="#4F46E5"
          />
          <StatCard
            count={reservationStatusReport?.last_month_reservations || 0}
            label="Booking last month"
            barColor="#8B5CF6"
            accentColor="#8B5CF6"
          />
          <StatCard
            count={reservationStatusReport?.running_month_reservations || 0}
            label={`Total booking (${getCurrentMonthName()})`}
            barColor="#0EA5E9"
            accentColor="#0EA5E9"
          />
        </div>
        {/* Label */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-y-2 md:gap-y-0 my-4">
          <h2 className="flex-1 text-2xl text-primary-text">List of items</h2>
          <div className="flex-1 flex gap-x-4 justify-end">
            {/* Date filter */}
            <DateSearchBox onDateChange={handleDateChange} />
            {/* Search box by id */}
            <TextSearchBox
              placeholder="Search by Reservation ID"
              value={reservationsSearchQuery}
              onChange={handleSearchChange}
            />
          </div>
        </div>
        {/* List of content */}
        <div className="bg-sidebar p-4 rounded-lg overflow-x-auto ">
          <TableReservationList data={reservations} />
          <div className="mt-4 flex justify-center">
            <Pagination
              page={reservationsCurrentPage}
              total={reservationsCount}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default ScreenStaffReservations;
