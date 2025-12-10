/* eslint-disable @typescript-eslint/no-explicit-any */
import { useOwner } from "@/context/ownerContext";
import { useEffect, useState } from "react";
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
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
    </div>
    <div className="w-10 h-10 rounded-lg bg-[#0055FE]/10 flex items-center justify-center text-[#0055FE]">
      <LayoutGrid size={20} />
    </div>
  </div>
);

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className={`bg-white rounded-xl w-full ${maxWidth} p-6 shadow-2xl scale-100 animate-scaleIn`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
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

  const [formData, setFormData] = useState({
    name: "",
    area: "Primary"
  });

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

  const copyToClipboard = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Link copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openEditModal = (device: any) => {
    setSelectedDevice(device);
    setFormData({ name: device.name || "", area: device.area || "Primary" });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (device: any) => {
    setSelectedDevice(device);
    setIsDeleteModalOpen(true);
  };

  // API Actions
  const handleCreateSubmit = async () => {
    setLoading(true);
    try {
      await axiosInstance.post("/owners/devices/", {
        name: formData.name,
        area: formData.area
      });
      toast.success("Table created successfully");
      setIsAddModalOpen(false);
      fetchAllDevices();
      fetchDeviceStats();
    } catch (error) {
      console.error("Create failed", error);
      toast.error("Failed to create table");
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!selectedDevice) return;
    setLoading(true);
    try {
      await axiosInstance.patch(`/owners/devices/${selectedDevice.id}/`, {
        name: formData.name,
        area: formData.area
      });
      toast.success("Table updated successfully");
      setIsEditModalOpen(false);
      fetchAllDevices();
    } catch (error) {
      console.error("Update failed", error);
      toast.error("Failed to update table");
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
      fetchAllDevices();
      fetchDeviceStats();
    } catch (error) {
      console.error("Delete failed", error);
      toast.error("Failed to delete table");
    } finally {
      setLoading(false);
    }
  };

  // Helper to generate full URL (Assuming generic structure or from context)
  const getTableUrl = (uid: string) => {
    return `${window.location.origin}/menu/${uid}`;
  };

  return (
    <div className="min-h-screen bg-white font-inter">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 w-full md:w-2/3">
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h2 className="text-lg font-bold text-slate-900">Registered Table List</h2>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                setFormData({ name: "", area: "Primary" });
                setIsAddModalOpen(true);
              }}
              className="bg-[#0055FE] hover:bg-[#0047D1] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-500/20 whitespace-nowrap"
            >
              <Plus size={16} />
              Add Table
            </button>
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search by table name"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10"
                value={devicesSearchQuery}
                onChange={handleSearch}
              />
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Table Name</th>
                <th className="px-6 py-4">Area</th>
                <th className="px-6 py-4">URL</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {allDevices.length > 0 ? (
                allDevices.map((device: any) => (
                  <tr key={device.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{device.name || device.table_name}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">Primary</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400 truncate max-w-[200px]">
                          {getTableUrl(device.uid)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(getTableUrl(device.uid), device.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0055FE] text-[#0055FE] text-xs font-bold hover:bg-[#0055FE]/5 transition-colors"
                        >
                          {copiedId === device.id ? <Check size={14} /> : <Copy size={14} />}
                          Copy Link
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
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
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    No tables found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-6">
        <p className="text-xs text-slate-400">Powered by CleverBiz AI</p>
      </div>

      {/* --- MODALS --- */}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
        title={isEditModalOpen ? "Edit Table" : "Add Table"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Table Name</label>
            <input
              type="text"
              placeholder="e.g. Table 1"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Area</label>
            <input
              type="text"
              value="Primary"
              disabled
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 outline-none cursor-not-allowed"
            />
          </div>
          {isEditModalOpen && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Table Unique URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={getTableUrl(selectedDevice?.uid)}
                  readOnly
                  className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 outline-none"
                />
                <button
                  onClick={() => copyToClipboard(getTableUrl(selectedDevice?.uid), selectedDevice?.id)}
                  className="h-10 px-3 border border-[#0055FE] text-[#0055FE] rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
          )}
          <button
            onClick={isEditModalOpen ? handleEditSubmit : handleCreateSubmit}
            disabled={loading}
            className="w-full h-10 mt-2 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? "Saving..." : (isEditModalOpen ? "Save Changes" : "Create Table")}
          </button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Table" maxWidth="max-w-sm">
        <div className="space-y-6">
          <p className="text-slate-600">Are you sure you want to delete <span className="font-bold text-slate-900">{selectedDevice?.name}</span>? This action cannot be undone.</p>
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
    </div>
  );
};
