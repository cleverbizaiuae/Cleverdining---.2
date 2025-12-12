/* eslint-disable @typescript-eslint/no-explicit-any */
import { useOwner } from "@/context/ownerContext";
import { useEffect, useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Key,
  Trash2,
  MoreHorizontal,
  X,
  ShieldCheck,
  User
} from "lucide-react";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";

// --- COMPONENTS ---

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

const ScreenRestaurantManagement = () => {
  const {
    members,
    membersSearchQuery,
    fetchMembers,
    createMember,
    updateMemberStatus,
    setMembersSearchQuery,
  } = useOwner();

  // State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Form States (Simple controlled inputs for speed)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "staff"
  });

  const [passwordData, setPasswordData] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  // Effects
  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSearch = (e: any) => {
    setMembersSearchQuery(e.target.value);
    // Debounce is handled in context or we can add here if needed, context usually handles it
    // fetchMembers(e.target.value); 
  };

  // Handlers
  const openEditModal = (member: any) => {
    setSelectedMember(member);
    setFormData({
      name: member.first_name || "", // Assuming backend uses first_name/last_name or name
      username: member.username || "",
      password: "",
      role: member.role || "staff"
    });
    setIsEditModalOpen(true);
  };

  const openPasswordModal = (member: any) => {
    setSelectedMember(member);
    setPasswordData({ oldPassword: "", newPassword: "", confirmPassword: "" });
    setIsPasswordModalOpen(true);
  };

  const openDeleteModal = (member: any) => {
    setSelectedMember(member);
    setIsDeleteModalOpen(true);
  };

  // API Actions
  const handleCreateSubmit = async () => {
    setLoading(true);
    try {
      // Create FormData properly
      const data = new FormData();
      data.append("first_name", formData.name);
      data.append("email", formData.email); // Append email
      data.append("username", formData.username);
      data.append("password", formData.password);
      data.append("role", formData.role);

      await createMember(data);

      toast.success("Member created successfully");
      setIsAddModalOpen(false);
      setFormData({
        name: "",
        username: "",
        password: "",
        role: "staff",
      });
      fetchMembers();
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.error || "Failed to create member";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!selectedMember) return;
    setLoading(true);
    try {
      await axiosInstance.patch(`/owners/team/${selectedMember.id}/update/`, {
        first_name: formData.name,
        username: formData.username,
        role: formData.role
      });
      toast.success("Member updated successfully");
      setIsEditModalOpen(false);
      fetchMembers();
    } catch (error) {
      console.error("Update failed", error);
      toast.error("Failed to update member");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!selectedMember) return;
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await axiosInstance.post(`/owners/team/${selectedMember.id}/change-password/`, {
        old_password: passwordData.oldPassword,
        new_password: passwordData.newPassword
      });
      toast.success("Password changed successfully");
      setIsPasswordModalOpen(false);
    } catch (error) {
      console.error("Password change failed", error);
      toast.error("Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!selectedMember) return;
    setLoading(true);
    try {
      await axiosInstance.delete(`/owners/team/${selectedMember.id}/delete/`);
      toast.success("Member deleted successfully");
      setIsDeleteModalOpen(false);
      fetchMembers();
    } catch (error) {
      console.error("Delete failed", error);
      toast.error("Failed to delete member");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-50/50 p-6 font-inter">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="text-[#0055FE]" size={24} />
            Team Management
          </h2>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0055FE]" size={16} />
              <input
                type="text"
                placeholder="Search by name or username"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10"
                value={membersSearchQuery}
                onChange={handleSearch}
              />
            </div>
            <button
              onClick={() => {
                setFormData({ name: "", username: "", password: "", role: "staff" });
                setIsAddModalOpen(true);
              }}
              className="bg-[#0055FE] hover:bg-[#0047D1] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-500/20 whitespace-nowrap"
            >
              <Plus size={16} />
              Add Member
            </button>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Username</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {members.length > 0 ? (
                members.map((member: any) => (
                  <tr key={member.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold border border-slate-200">
                          {member.first_name ? member.first_name[0].toUpperCase() : <User size={14} />}
                        </div>
                        <span className="font-medium text-slate-900">{member.first_name} {member.last_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">@{member.username}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[#0055FE]/10 text-[#0055FE]">
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEditModal(member)} className="p-1.5 text-[#0055FE] hover:bg-[#0055FE]/10 rounded transition-colors" title="Edit">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => openPasswordModal(member)} className="p-1.5 text-[#0055FE] hover:bg-[#0055FE]/10 rounded transition-colors" title="Change Password">
                          <Key size={16} />
                        </button>
                        <button onClick={() => openDeleteModal(member)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    No team members found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100 bg-white">
          {members.length > 0 ? (
            members.map((member: any) => (
              <div key={member.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg border border-slate-200">
                      {member.first_name ? member.first_name[0].toUpperCase() : <User size={18} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{member.first_name} {member.last_name}</h4>
                      <p className="text-xs text-slate-500">@{member.username}</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[#0055FE]/10 text-[#0055FE]">
                    {member.role}
                  </span>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-50">
                  <button onClick={() => openEditModal(member)} className="p-2 text-[#0055FE] bg-[#0055FE]/5 rounded-lg hover:bg-[#0055FE]/10 transition-colors flex-1 flex justify-center">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => openPasswordModal(member)} className="p-2 text-[#0055FE] bg-[#0055FE]/5 rounded-lg hover:bg-[#0055FE]/10 transition-colors flex-1 flex justify-center">
                    <Key size={16} />
                  </button>
                  <button onClick={() => openDeleteModal(member)} className="p-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors flex-1 flex justify-center">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-slate-400">No team members found</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-6">
        <p className="text-xs text-slate-400">Powered by CleverBiz AI</p>
      </div>

      {/* --- MODALS --- */}

      {/* Add Member Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Create Member">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              placeholder="Full Name"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
            <input
              type="text"
              placeholder="username"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={formData.username}
              onChange={e => setFormData({ ...formData, username: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
            <select
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none bg-white"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="staff">Staff</option>
              <option value="chef">Chef</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <button
            onClick={handleCreateSubmit}
            disabled={loading}
            className="w-full h-10 mt-2 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? "Creating..." : "Create Member"}
          </button>
        </div>
      </Modal>

      {/* Edit Member Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Member">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
            <input
              type="text"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={formData.username}
              onChange={e => setFormData({ ...formData, username: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
            <select
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none bg-white"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="staff">Staff</option>
              <option value="chef">Chef</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <button
            onClick={handleEditSubmit}
            disabled={loading}
            className="w-full h-10 mt-2 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} title="Change Password">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Change password for <span className="font-bold text-slate-900">{selectedMember?.first_name}</span></p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Old Password</label>
            <input
              type="password"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={passwordData.oldPassword}
              onChange={e => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={passwordData.newPassword}
              onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Confirm Password</label>
            <input
              type="password"
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 focus:border-[#0055FE] focus:ring-2 focus:ring-[#0055FE]/10 outline-none"
              value={passwordData.confirmPassword}
              onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
            />
          </div>
          <button
            onClick={handlePasswordSubmit}
            disabled={loading}
            className="w-full h-10 mt-2 bg-[#0055FE] hover:bg-[#0047D1] text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? "Changing..." : "Change Password"}
          </button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Member" maxWidth="max-w-sm">
        <div className="space-y-6">
          <p className="text-slate-600">Are you sure you want to delete <span className="font-bold text-slate-900">{selectedMember?.first_name}</span>? This action cannot be undone.</p>
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
              {loading ? "Deleting..." : "Delete Member"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ScreenRestaurantManagement;
