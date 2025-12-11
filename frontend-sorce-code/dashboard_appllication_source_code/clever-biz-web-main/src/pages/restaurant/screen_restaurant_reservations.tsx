/* eslint-disable @typescript-eslint/no-explicit-any */
import { useOwner } from "@/context/ownerContext";
import { useEffect, useState } from "react";
import {
  Users,
  Search,
  Calendar as CalendarIcon,
  ChevronRight,
  PhoneCall,
  Mail,
  MessageSquare,
  MoreHorizontal,
  X,
  Headphones
} from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import toast from "react-hot-toast";

// --- COMPONENTS ---

const MetricCard = ({ title, value, subtext }: any) => (
  <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-start gap-4 h-full relative overflow-hidden group hover:shadow-md transition-shadow">
    {/* Vertical Bar */}
    <div className="w-1.5 h-12 bg-[#0055FE] rounded-full shrink-0"></div>
    <div className="flex-1">
      <h3 className="text-3xl font-bold text-slate-900 mb-1">{value}</h3>
      <p className="text-xs text-slate-500 font-medium mb-1">{title}</p>
      <div className="flex items-center text-slate-400 group-hover:text-[#0055FE] transition-colors text-[10px] cursor-pointer gap-1 font-medium">
        Details <ChevronRight size={12} />
      </div>
    </div>
  </div>
);

const AddAssistantModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl scale-100 animate-scaleIn">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-slate-900">Add Assistant</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone Number</label>
            <div className="flex gap-2">
              <div className="w-20 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-lg">
                🇺🇸
              </div>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                className="flex-1 h-10 bg-[#0055FE] text-white placeholder-blue-200 px-4 rounded-lg outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Twilio SID</label>
            <input
              type="text"
              placeholder="AC..."
              className="w-full h-10 bg-[#0055FE] text-white placeholder-blue-200 px-4 rounded-lg outline-none focus:ring-2 focus:ring-blue-400/50 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Twilio Token</label>
            <input
              type="password"
              placeholder="••••••••••••••••"
              className="w-full h-10 bg-[#0055FE] text-white placeholder-blue-200 px-4 rounded-lg outline-none focus:ring-2 focus:ring-blue-400/50 font-mono text-sm"
            />
          </div>

          <button className="w-full h-10 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg mt-2 transition-colors shadow-lg shadow-blue-500/20">
            Update Assistant
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [assistantModalOpen, setAssistantModalOpen] = useState(false);

  // Formatting Helper
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Effects
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(reservationsSearchQuery), 500);
    return () => clearTimeout(timer);
  }, [reservationsSearchQuery]);

  useEffect(() => {
    const dateString = selectedDate ? formatDateForAPI(selectedDate) : undefined;
    fetchReservations(reservationsCurrentPage, debouncedSearchQuery, dateString);
    fetchReservationStatusReport();
  }, [reservationsCurrentPage, debouncedSearchQuery, selectedDate, fetchReservations, fetchReservationStatusReport]);


  return (
    <div className="font-inter">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          {selectedDate ? selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : "Reservations"}
        </h1>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <MetricCard
          title="Active booking"
          value={reservationStatusReport?.total_active_accepted_reservations || 0}
        />
        <MetricCard
          title="Booking last month"
          value={reservationStatusReport?.last_month_reservations || 0}
        />
        <MetricCard
          title="Total booking (Jun)"
          value={reservationStatusReport?.running_month_reservations || 0}
        />
      </div>

      {/* List Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-semibold text-slate-900">List of items</h2>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Date Picker */}
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <DatePicker
              selected={selectedDate}
              onChange={(date: Date | null) => {
                setSelectedDate(date);
                setReservationsCurrentPage(1);
              }}
              dateFormat="dd/MM/yyyy"
              placeholderText="dd/mm/yyyy"
              className="h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 w-full sm:w-40 cursor-pointer"
            />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search by Reservation ID"
              value={reservationsSearchQuery}
              onChange={(e) => {
                setReservationsSearchQuery(e.target.value);
                setReservationsCurrentPage(1);
              }}
              className="h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 w-full sm:w-64"
            />
          </div>

          {/* Assistant Button */}
          <button
            onClick={() => setAssistantModalOpen(true)}
            className="h-10 px-6 bg-[#0055FE] hover:bg-[#0047D1] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
          >
            <Users size={18} />
            Assistant
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Table</th>
              <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Guests</th>
              <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Contact</th>
              <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-xs font-medium text-slate-600 uppercase tracking-wider">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reservations && reservations.length > 0 ? (
              reservations.map((res: any) => (
                <tr key={res.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-slate-900">{res.customer_name}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">
                    {res.device_table_name || `Table ${res.device}`}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#0055FE]/10 text-[#0055FE]">
                      {res.guest_no} guests
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-600 font-medium">{res.cell_number}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[150px]">{res.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">
                    {new Date(res.reservation_time).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm italic truncate max-w-[150px]">
                    {res.special_request || "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  No reservations found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-slate-100">
        {reservations && reservations.length > 0 ? (
          reservations.map((res: any) => (
            <div key={res.id} className="p-4 hover:bg-slate-50/50 transition-colors border border-slate-200 rounded-lg mb-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-slate-900 font-medium text-base">{res.customer_name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 bg-[#0055FE]/10 text-[#0055FE] text-[10px] rounded-full font-medium">
                      {res.guest_no} guests
                    </span>
                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs text-slate-500">
                      {res.device_table_name || `Table ${res.device}`}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-1 rounded">
                  {new Date(res.reservation_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-50">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <PhoneCall size={12} /> {res.cell_number}
                </div>
                {res.email && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Mail size={12} /> {res.email}
                  </div>
                )}
                {res.special_request && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                    <MessageSquare size={12} /> {res.special_request}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 text-center text-slate-500">No reservations found</div>
        )}
      </div>

      {/* Pagination (Simple) */}
      <div className="py-6 flex justify-center">
        <div className="flex gap-2">
          <button
            onClick={() => setReservationsCurrentPage(Math.max(1, reservationsCurrentPage - 1))}
            disabled={reservationsCurrentPage === 1}
            className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-slate-600 self-center border border-transparent">Page {reservationsCurrentPage}</span>
          <button
            onClick={() => setReservationsCurrentPage(reservationsCurrentPage + 1)}
            disabled={reservations.length < 10}
            className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 text-slate-600"
          >
            Next
          </button>
        </div>
      </div>

      <AddAssistantModal isOpen={assistantModalOpen} onClose={() => setAssistantModalOpen(false)} />
    </div>
  );
};

export default ScreenRestaurantReservations;
