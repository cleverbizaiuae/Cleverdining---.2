/* eslint-disable @typescript-eslint/no-explicit-any */
import { useOwner } from "@/context/ownerContext";
import { useEffect, useState, type FormEvent } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  LayoutGrid,
  X,
  Link
} from "lucide-react";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";

// --- COMPONENTS ---

const MetricCard = ({ title, value, subtext }: any) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
      <h3 className="text-2xl font-semibold text-slate-900">{value}</h3>
    </div>
    <div className="w-10 h-10 rounded-lg bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE]">
      <LayoutGrid size={20} />
    </div>
  </div>
);

const deriveTableNumber = (name: string) => {
  const trimmed = name.trim();
  const digits = trimmed.replace(/\D/g, "");
  return (digits || trimmed).slice(0, 20);
};

const getApiErrorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (typeof data === "string") return data;
  if (typeof data.detail === "string") return data.detail;
  if (typeof data.error === "string") return data.error;
  if (Array.isArray(data.table_name) && data.table_name[0]) return data.table_name[0];
  if (Array.isArray(data.capacity) && data.capacity[0]) return data.capacity[0];
  if (typeof data.message === "string") return data.message;
  return fallback;
};

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 py-8 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className={`bg-white rounded-2xl w-full ${maxWidth} p-7 shadow-2xl scale-100 animate-scaleIn my-auto max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-center mb-6 sticky top-0 bg-white pb-2 -mt-2 pt-2">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 p-1 transition-colors">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
};

export const ScreenRestaurantDevices = () => {
  const {
    allDevices,
    devicesCount,
    devicesCurrentPage,
    devicesSearchQuery,
    deviceStats,
    devicesError,
    fetchAllDevices,
    fetchDeviceStats,
    setDevicesCurrentPage,
    setDevicesSearchQuery,
  } = useOwner();

  // State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isEndSessionModalOpen, setIsEndSessionModalOpen] = useState(false);
  const [sessionToClose, setSessionToClose] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    area: "",
    capacity: "4",
  });

  const tableLimit = Number(deviceStats?.table_limit || 0);
  const currentTableCount = Number(deviceStats?.total_devices || 0);
  const tableLimitReached = tableLimit > 0 && currentTableCount >= tableLimit;

  // Effects
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchDeviceStats(), fetchAllDevices()]);
      } catch (error) {
        console.error("Failed to load device data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchDeviceStats, fetchAllDevices]);

  // Handlers
  const handleSearch = (e: any) => {
    setDevicesSearchQuery(e.target.value);
    fetchAllDevices(1, e.target.value);
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchAllDevices(1, devicesSearchQuery);
  };

  const copyToClipboard = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Link copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openEditModal = (device: any) => {
    setSelectedDevice(device);
    setFormData({
      name: device.table_name || device.name || "",
      area: device.region || device.area || "",
      capacity: String(device.capacity || 4),
    });
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (device: any) => {
    setSelectedDevice(device);
    setIsDeleteModalOpen(true);
  };

  // API Actions
  // API Actions
  const handleCreateSubmit = async () => {
    if (tableLimitReached) {
      toast.error("Table limit reached");
      return;
    }
    const tableName = formData.name.trim();
    const area = formData.area.trim();
    const capacity = Number(formData.capacity);
    if (!tableName) {
      const message = "Please enter a table name.";
      setFormError(message);
      toast.error(message);
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      const message = "Capacity must be a whole number between 1 and 100.";
      setFormError(message);
      toast.error(message);
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      const endpoint = "/owners/devices/"; // Device creation is centralized for owners/staff usually
      // Ideally should use dynamic endpoint:
      // const endpoint = (userRole === "owner" || userRole === "staff") ? "/owners/devices/" : "/chef/devices/";

      await axiosInstance.post(endpoint, {
        table_name: tableName,
        table_number: deriveTableNumber(tableName),
        region: area,
        capacity,
      });
      toast.success("Table created successfully");
      setIsAddModalOpen(false);
      setFormError(null);
      setFormData({ name: "", area: "", capacity: "4" });
      await Promise.all([fetchAllDevices(1, devicesSearchQuery), fetchDeviceStats()]);
    } catch (error: any) {
      console.error("Create failed", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        setTimeout(() => {
          window.location.href = '/login';
        }, 1000);
        return;
      }
      toast.error(getApiErrorMessage(error, "Failed to create table"));
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!selectedDevice) return;
    const tableName = formData.name.trim();
    const area = formData.area.trim();
    const capacity = Number(formData.capacity);
    if (!tableName) {
      const message = "Please enter a table name.";
      setFormError(message);
      toast.error(message);
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      const message = "Capacity must be a whole number between 1 and 100.";
      setFormError(message);
      toast.error(message);
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await axiosInstance.patch(`/owners/devices/${selectedDevice.id}/`, {
        table_name: tableName,
        table_number: deriveTableNumber(tableName),
        region: area,
        capacity,
      });
      toast.success("Table updated successfully");
      setIsEditModalOpen(false);
      setFormError(null);
      await Promise.all([fetchAllDevices(devicesCurrentPage, devicesSearchQuery), fetchDeviceStats()]);
    } catch (error: any) {
      console.error("Update failed", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        setTimeout(() => { window.location.href = '/login'; }, 1000);
        return;
      }
      toast.error(getApiErrorMessage(error, "Failed to update table"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!selectedDevice) return;
    setLoading(true);
    try {
      await axiosInstance.delete(`/owners/devices/${selectedDevice.id}/`);
      toast.success("Table deleted successfully");
      setIsDeleteModalOpen(false);
      await Promise.all([fetchAllDevices(devicesCurrentPage, devicesSearchQuery), fetchDeviceStats()]);
    } catch (error: any) {
      console.error("Delete failed", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        setTimeout(() => { window.location.href = '/login'; }, 1000);
        return;
      }
      toast.error("Failed to delete table");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSessionClick = (sessionId: number) => {
    setSessionToClose(sessionId);
    setIsEndSessionModalOpen(true);
  };

  const confirmCloseSession = async () => {
    if (!sessionToClose) return;
    setLoading(true);
    try {
      await axiosInstance.post(`/api/staff/sessions/${sessionToClose}/close/`);
      toast.success("Session closed successfully");
      await Promise.all([fetchAllDevices(), fetchDeviceStats()]);
      setIsEndSessionModalOpen(false);
    } catch (e: any) {
      console.error(e);
      const msg = e.response?.data?.error || e.response?.data?.detail || e.message || "Failed to close session";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Helper to generate full URL (Previously used, now using API-provided table_url)
  // const getTableUrl = (uid: string) => {
  //   return `${window.location.origin}/menu/${uid}`;
  // };

  return (
    <div className="min-h-screen font-inter">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 w-full md:w-2/3 xl:w-1/2">
        <MetricCard
          title="Total Tables"
          value={deviceStats?.total_devices || 0}
        />
        <MetricCard
          title="Active Tables"
          value={deviceStats?.active_devices || 0}
        />
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h2 className="text-base font-semibold text-slate-900">Registered Table List</h2>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                if (tableLimitReached) {
                  toast.error("Table limit reached");
                  return;
                }
                setFormData({ name: "", area: "", capacity: "4" });
                setFormError(null);
                setIsAddModalOpen(true);
              }}
              disabled={tableLimitReached}
              className="h-9 bg-[#0055FE] hover:bg-[#0047D1] text-white px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-500/20 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Add Table
            </button>
            <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64">
              <button
                type="submit"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Search tables"
              >
                <Search size={16} />
              </button>
              <input
                type="text"
                placeholder="Search by table name"
                className="w-full h-9 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10"
                value={devicesSearchQuery}
                onChange={handleSearch}
              />
            </form>
          </div>
        </div>

        {/* Mobile card view */}
        <div className="divide-y divide-slate-100 sm:hidden">
          {allDevices.length > 0 ? (
            allDevices.map((device: any) => (
              <div key={device.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{device.name || device.table_name}</p>
                    <p className="text-xs text-slate-500">{device.region ? `${device.region} area · ` : ""}Capacity {device.capacity || 4}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditModal(device)} className="p-2 text-[#0055FE] hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => openDeleteModal(device)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link size={14} className="text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-500 truncate">{device.table_url}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => copyToClipboard(device.table_url, device.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#0055FE] text-[#0055FE] text-xs font-bold hover:bg-[#0055FE]/5 transition-colors"
                  >
                    {copiedId === device.id ? <Check size={14} /> : <Copy size={14} />}
                    Copy Link
                  </button>
                  {device.active_session_id && (
                    <button
                      onClick={() => handleCloseSessionClick(device.active_session_id)}
                      className="inline-flex items-center px-3 py-2 bg-blue-50 hover:bg-blue-100 text-[#0055FE] text-xs font-bold uppercase rounded-lg border border-blue-200 transition-colors"
                    >
                      End Session
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : devicesError ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-red-600">{devicesError}</p>
              <button
                type="button"
                onClick={() => Promise.all([fetchDeviceStats(), fetchAllDevices()])}
                className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-slate-400">No tables found</div>
          )}
        </div>

        {/* Desktop table view */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Table Name</th>
                <th className="px-6 py-4">Area</th>
                <th className="px-6 py-4">Capacity</th>
                <th className="px-6 py-4">URL</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {allDevices.length > 0 ? (
                allDevices.map((device: any) => (
                  <tr key={device.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{device.name || device.table_name}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{device.region || "—"}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{device.capacity || 4}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400 truncate max-w-[200px]">
                          {device.table_url}
                        </span>
                        <button
                          onClick={() => copyToClipboard(device.table_url, device.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0055FE] text-[#0055FE] text-xs font-bold hover:bg-[#0055FE]/5 transition-colors"
                        >
                          {copiedId === device.id ? <Check size={14} /> : <Copy size={14} />}
                          Copy Link
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {device.active_session_id && (
                          <button
                            onClick={() => handleCloseSessionClick(device.active_session_id)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-[#0055FE] text-[10px] font-bold uppercase rounded border border-blue-200 transition-colors mr-2 whitespace-nowrap"
                            title="Manually Close Session"
                          >
                            End Session
                          </button>
                        )}
                        <button onClick={() => openEditModal(device)} className="p-1.5 text-[#0055FE] hover:bg-blue-50 rounded transition-colors" title="Edit">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => openDeleteModal(device)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : devicesError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-sm font-medium text-red-600">{devicesError}</p>
                    <button
                      type="button"
                      onClick={() => Promise.all([fetchDeviceStats(), fetchAllDevices()])}
                      className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No tables found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {tableLimitReached && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-amber-800 text-sm font-medium">
            Table limit reached
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center mt-6">
        <p className="text-xs text-slate-400">Powered by CleverBiz AI</p>
      </div>

      {/* --- MODALS --- */}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setFormError(null); }}
        title={isEditModalOpen ? "Edit Table" : "Add Table"}
      >
        <div className="space-y-4">
	          <div>
	            <label className="block text-xs font-medium text-slate-700 mb-1">Table Name <span className="text-red-500">*</span></label>
	            <input
	              type="text"
	              required
	              aria-required="true"
	              aria-invalid={Boolean(formError && !formData.name.trim())}
	              placeholder="e.g. Table 1"
	              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
	              value={formData.name}
	              onChange={e => {
	                setFormData({ ...formData, name: e.target.value });
	                if (formError) setFormError(null);
	              }}
	              onKeyDown={e => {
	                if (e.key === "Enter") {
	                  e.preventDefault();
	                  if (isEditModalOpen) {
	                    handleEditSubmit();
	                  } else {
	                    handleCreateSubmit();
	                  }
	                }
	              }}
	            />
	            {formError && (
	              <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
	                {formError}
	              </p>
	            )}
	          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Area (Optional)</label>
	            <input
	              type="text"
	              placeholder="e.g. Patio"
	              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
	              value={formData.area}
	              onChange={e => setFormData({ ...formData, area: e.target.value })}
	              onKeyDown={e => {
	                if (e.key === "Enter") {
	                  e.preventDefault();
	                  if (isEditModalOpen) {
	                    handleEditSubmit();
	                  } else {
	                    handleCreateSubmit();
	                  }
	                }
	              }}
	            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Guest Capacity</label>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              className="w-full h-12 px-4 border border-slate-200 rounded-xl text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={formData.capacity}
              onChange={e => {
                setFormData({ ...formData, capacity: e.target.value });
                if (formError) setFormError(null);
              }}
            />
            <p className="mt-1.5 text-xs text-slate-400">Used to hide reservation times that cannot seat the party.</p>
          </div>
          {isEditModalOpen && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Table Unique URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={selectedDevice?.table_url || ""}
                  readOnly
                  className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 outline-none"
                />
                <button
                  onClick={() => copyToClipboard(selectedDevice?.table_url, selectedDevice?.id)}
                  className="h-10 px-3 border border-[#0055FE] text-[#0055FE] rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
          )}
          <button
            onClick={isEditModalOpen ? handleEditSubmit : handleCreateSubmit}
            disabled={loading || (!isEditModalOpen && tableLimitReached)}
            className="w-full h-12 mt-2 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? "Saving..." : (isEditModalOpen ? "Save Changes" : "Create Table")}
          </button>
        </div>
      </Modal>

	      {/* Delete Modal */}
	      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Table" maxWidth="max-w-sm">
	        <div className="space-y-6">
	          <p className="text-slate-600">Are you sure you want to delete <span className="font-bold text-slate-900">{selectedDevice?.table_name || selectedDevice?.name}</span>? This action cannot be undone.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="flex-1 h-10 border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteSubmit}
              disabled={loading}
              className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors shadow-lg shadow-red-500/20 disabled:opacity-70 flex items-center justify-center"
            >
              {loading ? "Deleting..." : "Delete Table"}
            </button>
          </div>
        </div>
      </Modal>
      {/* End Session Modal */}
      <Modal isOpen={isEndSessionModalOpen} onClose={() => setIsEndSessionModalOpen(false)} title="End Session" maxWidth="max-w-sm">
        <div className="space-y-6">
          <p className="text-slate-600">Are you sure you want to end this session? This will immediately log out the table and redirect to the login screen.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setIsEndSessionModalOpen(false)}
              className="flex-1 h-10 border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmCloseSession}
              disabled={loading}
              className="flex-1 h-10 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center"
            >
              {loading ? "Ending..." : "End Session"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
