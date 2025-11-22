// import { AssistantModal } from "@/components/modals";
import { TableReservationList } from "@/components/tables";
import { useOwner } from "@/context/ownerContext";

import { AssistantModal, NewAssistantModal } from "@/components/modals";

import { AssistantCredentials } from "@/types";
import { useEffect, useState } from "react";
import { FiHeadphones } from "react-icons/fi";
import { DateSearchBox, TextSearchBox } from "../../components/input";
import { Pagination, StatCard } from "../../components/utilities";

/* Screen to list of reservations on restaurant end */
const ScreenRestaurantReservations = () => {
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

 
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [assistantModalOpen, setAssistantModalOpen] = useState(false);
  const [assistant, setAssistant] = useState<AssistantCredentials | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(reservationsSearchQuery);
    }, 500); // 500ms delay

    return () => clearTimeout(timer);
  }, [reservationsSearchQuery]);

  // Load reservations and status report on component mount
  useEffect(() => {
    const dateString = selectedDate
      ? formatDateForAPI(selectedDate)
      : undefined;
    fetchReservations(
      reservationsCurrentPage,
      debouncedSearchQuery,
      dateString
    );
    fetchReservationStatusReport();
  }, [
    reservationsCurrentPage,
    debouncedSearchQuery,
    selectedDate,
    fetchReservations,
    fetchReservationStatusReport,
  ]);

  const handlePageChange = (page: number) => {
    setReservationsCurrentPage(page);
  };

  const handleSearch = (query: string) => {
    setReservationsSearchQuery(query);
    setReservationsCurrentPage(1); // Reset to first page when searching
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
    setReservationsCurrentPage(1); // Reset to first page when date changes
  };

  // Assistant modal handlers
  const handleAssistantButtonClick = () => {
    setAssistantModalOpen(true);
  };
  const handleAssistantModalClose = () => {
    setAssistantModalOpen(false);
  };
  const handleSaveAssistant = (data: AssistantCredentials) => {
    setAssistantLoading(true);
    // Simulate API call delay
    setTimeout(() => {
      setAssistant(data);
      setAssistantModalOpen(false);
      setAssistantLoading(false);
    }, 1000);
  };

  // Helper function to format date properly for API
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

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
            barColor="#4F46E5" // indigo
            accentColor="#4F46E5"
          />
          <StatCard
            count={reservationStatusReport?.last_month_reservations || 0}
            label="Booking last month"
            barColor="#8B5CF6" // violet
            accentColor="#8B5CF6"
          />
          <StatCard
            count={reservationStatusReport?.running_month_reservations || 0}
            label="Total booking (Jun)"
            barColor="#0EA5E9" // sky blue
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
              onChange={handleSearch}
            />
            {/* Assistant button */}
            <button
              className="h-14 w-96 flex items-center justify-center bg-green-700 text-primary-text rounded-lg overflow-hidden shadow-md px-6 text-base font-medium transition-colors disabled:opacity-50"
              // onClick={handleAssistantButtonClick}
              onClick={() => setModelOpen(true)}
              type="button"
              disabled={assistantLoading}
            >
              <FiHeadphones className="mr-3 text-xl" />
              Assistant
            </button>
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
      {/* Assistant Modal */}
      <AssistantModal
        isOpen={assistantModalOpen}
        close={handleAssistantModalClose}
        onSave={handleSaveAssistant}
        initialData={assistant}
      />
      {modelOpen && (
        <NewAssistantModal
          isOpen={modelOpen}
          close={() => setModelOpen(false)}
        />
      )}
    </>
  );
};

export default ScreenRestaurantReservations;
