import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addStaff,
  deleteStaff,
  listLocations,
  listStaff,
  type MultiLocationRole,
  type StaffMemberRecord,
  updateStaff,
} from "./store";
import { RoleBadge } from "./components";

type StaffForm = {
  full_name: string;
  role: MultiLocationRole;
  location_id: string;
  status: StaffMemberRecord["status"];
};

const EMPTY_FORM: StaffForm = {
  full_name: "",
  role: "staff",
  location_id: "",
  status: "active",
};

export default function ScreenMultiLocationStaff() {
  const locations = useMemo(() => listLocations(), []);
  const [rows, setRows] = useState(() => listStaff());
  const [hireOpen, setHireOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMemberRecord | null>(null);
  const [form, setForm] = useState<StaffForm>({
    ...EMPTY_FORM,
    location_id: locations[0]?.id || "",
  });

  const locationMap = useMemo(() => new Map(locations.map((entry) => [entry.id, entry.name])), [locations]);

  const refresh = () => setRows(listStaff());

  const openHire = () => {
    setForm({ ...EMPTY_FORM, location_id: locations[0]?.id || "" });
    setHireOpen(true);
  };

  const openEdit = (staff: StaffMemberRecord) => {
    setEditTarget(staff);
    setForm({
      full_name: staff.full_name,
      role: staff.role,
      location_id: staff.location_id,
      status: staff.status,
    });
  };

  const saveHire = () => {
    if (!form.full_name.trim() || !form.location_id) {
      alert("Name and location are required.");
      return;
    }
    addStaff({
      full_name: form.full_name.trim(),
      role: form.role,
      location_id: form.location_id,
      status: form.status,
    });
    setHireOpen(false);
    refresh();
  };

  const saveEdit = () => {
    if (!editTarget) return;
    if (!form.full_name.trim() || !form.location_id) {
      alert("Name and location are required.");
      return;
    }
    updateStaff(editTarget.id, {
      full_name: form.full_name.trim(),
      role: form.role,
      location_id: form.location_id,
      status: form.status,
    });
    setEditTarget(null);
    refresh();
  };

  const remove = (id: string) => {
    if (!confirm("Remove this staff member?")) return;
    deleteStaff(id);
    refresh();
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Staff Roster</h3>
          <p className="text-sm text-slate-500 mt-1">Manage team members and location assignments.</p>
        </div>
        <button
          onClick={openHire}
          className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm inline-flex items-center gap-2"
        >
          <Plus size={14} />
          Hire New Staff
        </button>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.full_name}</td>
                  <td className="px-4 py-3"><RoleBadge role={row.role} /></td>
                  <td className="px-4 py-3 text-slate-700">{locationMap.get(row.location_id) || "-"}</td>
                  <td className="px-4 py-3 text-slate-700 capitalize">{row.status.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-red-500 hover:bg-red-50"
                        onClick={() => remove(row.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(hireOpen || editTarget) && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl shadow-lg">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{editTarget ? "Edit Staff Member" : "Hire New Staff"}</h3>
              <button
                onClick={() => {
                  setHireOpen(false);
                  setEditTarget(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <label className="text-sm text-slate-600 block">
                Full Name
                <input
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-slate-600 block">
                  Role
                  <select
                    value={form.role}
                    onChange={(event) => setForm({ ...form, role: event.target.value as MultiLocationRole })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="manager">Manager</option>
                    <option value="chef">Chef</option>
                    <option value="staff">Staff</option>
                    <option value="cashier">Cashier</option>
                  </select>
                </label>

                <label className="text-sm text-slate-600 block">
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value as StaffMemberRecord["status"] })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="active">Active</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </label>
              </div>

              <label className="text-sm text-slate-600 block">
                Location
                <select
                  value={form.location_id}
                  onChange={(event) => setForm({ ...form, location_id: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700"
                onClick={() => {
                  setHireOpen(false);
                  setEditTarget(null);
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
                onClick={editTarget ? saveEdit : saveHire}
              >
                {editTarget ? "Save Changes" : "Create Staff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
