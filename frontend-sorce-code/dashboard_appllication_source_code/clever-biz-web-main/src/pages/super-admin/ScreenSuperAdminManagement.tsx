import { useState, useMemo } from "react";
import {
    Search,
    Eye,
    Edit2,
    Star,
    Info,
    Calendar,
    Check,
    X,
    QrCode,
    School,
    CreditCard,
    ChevronDown
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import axiosInstance from "@/lib/axios"; // Uncomment when ready for real API

// --- Types ---
interface RegisteredRestaurant {
    id: string;
    name: string;
    location: string;
    country: string;
    city: string;
    phone: string;
    package: string;
    status: 'active' | 'on_hold' | 'inactive';
    qrCodes: number;
    tableCount: number;
    paymentProcessor: string;
    subscriptionStart: string; // ISO Date
    createdAt: string;
}

// --- Mock Data ---
const MOCK_RESTAURANTS: RegisteredRestaurant[] = [
    { id: "a1b2c3d4", name: "Gourmet Kitchen", location: "Downtown", country: "UAE", city: "Dubai", phone: "+971 50 123 4567", package: "Plus", status: "active", qrCodes: 15, tableCount: 12, paymentProcessor: "stripe", subscriptionStart: "2024-01-15", createdAt: "2024-01-01" },
    { id: "e5f6g7h8", name: "Spice House", location: "Marina", country: "UAE", city: "Dubai", phone: "+971 55 987 6543", package: "Basic", status: "on_hold", qrCodes: 5, tableCount: 5, paymentProcessor: "paytabs", subscriptionStart: "2024-02-01", createdAt: "2024-01-20" },
    { id: "i9j0k1l2", name: "Burger Joint", location: "West Bay", country: "Qatar", city: "Doha", phone: "+974 66 111 222", package: "Enterprise", status: "active", qrCodes: 30, tableCount: 25, paymentProcessor: "checkout", subscriptionStart: "2024-03-10", createdAt: "2024-02-28" },
    { id: "m3n4o5p6", name: "Taco Fiesta", location: "Juffair", country: "Bahrain", city: "Manama", phone: "+973 33 444 555", package: "Basic", status: "inactive", qrCodes: 8, tableCount: 8, paymentProcessor: "stripe", subscriptionStart: "2024-01-05", createdAt: "2023-12-15" },
    { id: "q7r8s9t0", name: "Sushi Art", location: "Palm Jumeirah", country: "UAE", city: "Dubai", phone: "+971 52 777 8888", package: "Pro", status: "active", qrCodes: 20, tableCount: 18, paymentProcessor: "stripe", subscriptionStart: "2024-04-20", createdAt: "2024-04-01" },
    { id: "u1v2w3x4", name: "Pasta Presto", location: "Yas Island", country: "UAE", city: "Abu Dhabi", phone: "+971 50 222 3333", package: "Plus", status: "active", qrCodes: 12, tableCount: 10, paymentProcessor: "paytabs", subscriptionStart: "2024-05-12", createdAt: "2024-05-01" },
];

const ScreenSuperAdminManagement = () => {
    // const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState("");

    // Modal State
    const [selectedRestaurant, setSelectedRestaurant] = useState<RegisteredRestaurant | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        qrCodes: 10,
        tableCount: 10,
        paymentProcessor: "stripe"
    });

    // --- Queries ---
    // Replace with real hook: useQuery({ queryKey: ['restaurants'], queryFn: fetchRestaurants })
    const { data: restaurants = MOCK_RESTAURANTS } = useQuery({
        queryKey: ['registered-restaurants'],
        queryFn: async () => MOCK_RESTAURANTS, // Mock fetch
        initialData: MOCK_RESTAURANTS
    });

    // --- Computed ---
    const filteredRestaurants = useMemo(() => {
        const lowerQ = searchQuery.toLowerCase();
        return restaurants.filter(r =>
            searchQuery === "" ||
            r.name.toLowerCase().includes(lowerQ) ||
            r.id.toLowerCase().includes(lowerQ)
        );
    }, [restaurants, searchQuery]);

    const stats = {
        total: restaurants.length,
        onHold: restaurants.filter(r => r.status === 'on_hold').length,
        active: restaurants.filter(r => r.status === 'active').length,
    };

    // --- Handlers ---
    const handleView = (r: RegisteredRestaurant) => {
        setSelectedRestaurant(r);
        setEditForm({
            qrCodes: r.qrCodes,
            tableCount: r.tableCount,
            paymentProcessor: r.paymentProcessor
        });
        setIsEditing(false);
    };

    const handleCloseModal = () => {
        setSelectedRestaurant(null);
        setIsEditing(false);
    };

    const handleSaveChanges = () => {
        // Here we would call mutation
        console.log("Saving changes for", selectedRestaurant?.id, editForm);
        // Mock update local state visually (in real app, invalidate queries)
        if (selectedRestaurant) {
            Object.assign(selectedRestaurant, {
                qrCodes: editForm.qrCodes,
                tableCount: editForm.tableCount,
                paymentProcessor: editForm.paymentProcessor
            });
        }
        setIsEditing(false);
    };

    const handleStatusChange = (id: string, newStatus: string) => {
        console.log("Updating status for", id, "to", newStatus);
        // Implement mutation here: updateStatusMutation.mutate({ id, status: newStatus })
        // For UI demo, force update mock (dirty but works for visual verification)
        const target = restaurants.find(r => r.id === id);
        if (target) target.status = newStatus as 'active' | 'on_hold' | 'inactive';
        // Force re-render would happen via Query invalidation normally
    };

    return (
        <div className="space-y-6 animate-fadeIn">

            {/* --- Stats Cards --- */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatCard
                    label="Total Restaurant"
                    value={stats.total}
                    iconColor="text-yellow-500"
                    rightIcon={<QrCode size={20} />}
                />
                <StatCard
                    label="Total On Hold"
                    value={stats.onHold}
                    iconColor="text-red-500"
                    rightIcon={<QrCode size={20} />}
                />
                <StatCard
                    label="Active Today"
                    value={stats.active}
                    iconColor="text-yellow-500"
                    rightIcon={<QrCode size={20} />}
                />
            </div>

            {/* --- Search Section --- */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                <h2 className="text-lg font-semibold text-slate-900">Subscriber management</h2>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0055FE]" size={16} />
                    <input
                        type="text"
                        placeholder="Search subscriber"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-9 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#0055FE] focus:border-[#0055FE] outline-none transition-all placeholder:text-slate-400"
                    />
                </div>
            </div>

            {/* --- Restaurant Table --- */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">

                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium uppercase text-slate-600">
                            <tr>
                                <th className="px-5 py-3">Restaurant</th>
                                <th className="px-5 py-3">ID</th>
                                <th className="px-5 py-3">Phone</th>
                                <th className="px-5 py-3">Start Date</th>
                                <th className="px-5 py-3">Package</th>
                                <th className="px-5 py-3">Info</th>
                                <th className="px-5 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRestaurants.length > 0 ? filteredRestaurants.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-3 text-xs font-medium text-slate-900">{r.name}</td>
                                    <td className="px-5 py-3 text-xs text-slate-500 font-mono">{r.id.substring(0, 8)}</td>
                                    <td className="px-5 py-3 text-xs text-slate-500">{r.phone}</td>
                                    <td className="px-5 py-3 text-xs text-slate-500">{r.subscriptionStart}</td>
                                    <td className="px-5 py-3 text-xs">
                                        <span className="bg-blue-50 text-[#0055FE] px-2 py-0.5 rounded border border-blue-100 font-medium">
                                            {r.package}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3">
                                        <button
                                            onClick={() => handleView(r)}
                                            className="flex items-center gap-1 text-[#0055FE] hover:underline text-xs font-medium"
                                        >
                                            <Eye size={14} />
                                            View
                                        </button>
                                    </td>
                                    <td className="px-5 py-3">
                                        <StatusSelect
                                            value={r.status}
                                            onChange={(val) => handleStatusChange(r.id, val)}
                                        />
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-slate-400 text-sm">No restaurants found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden divide-y divide-slate-100">
                    {filteredRestaurants.map(r => (
                        <div key={r.id} className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="text-sm font-medium text-slate-900">{r.name}</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">{r.package} • {r.subscriptionStart}</p>
                                </div>
                                <button onClick={() => handleView(r)} className="text-[#0055FE]">
                                    <Eye size={18} />
                                </button>
                            </div>
                            <div className="flex justify-between items-center gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs text-slate-400">{r.phone}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">#{r.id.substring(0, 8)}</p>
                                </div>
                                <div className="min-w-[120px]">
                                    <StatusSelect
                                        value={r.status}
                                        onChange={(val) => handleStatusChange(r.id, val)}
                                        isMobile
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- Detail Modal --- */}
            {selectedRestaurant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Information</h3>
                                <p className="text-xs text-slate-500">Restaurant details and settings</p>
                            </div>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto space-y-6">

                            {/* Read-Only Fields */}
                            <div className="space-y-4">
                                <ReadOnlyField label="Restaurant Name" value={selectedRestaurant.name} />
                                <ReadOnlyField label="Location" value={`${selectedRestaurant.location}, ${selectedRestaurant.city}, ${selectedRestaurant.country}`} />
                                <div className="grid grid-cols-2 gap-4">
                                    <ReadOnlyField label="Starting Date" value={selectedRestaurant.subscriptionStart} icon={<Calendar size={14} className="text-[#0055FE]" />} />
                                    <ReadOnlyField label="Phone Number" value={selectedRestaurant.phone} />
                                </div>
                                <ReadOnlyField label="Package" value={selectedRestaurant.package} />
                            </div>

                            {/* Settings Section */}
                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        Settings
                                    </h4>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className="text-xs font-medium text-[#0055FE] hover:underline flex items-center gap-1"
                                    >
                                        <Edit2 size={12} />
                                        {isEditing ? "Cancel" : "Edit"}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <SettingField
                                        label="QR Codes"
                                        isEditing={isEditing}
                                        value={isEditing ? editForm.qrCodes : selectedRestaurant.qrCodes}
                                        onChange={(v) => setEditForm({ ...editForm, qrCodes: Number(v) })}
                                        icon={<QrCode size={14} className="text-slate-400" />}
                                        type="number"
                                    />
                                    <SettingField
                                        label="Tables"
                                        isEditing={isEditing}
                                        value={isEditing ? editForm.tableCount : selectedRestaurant.tableCount}
                                        onChange={(v) => setEditForm({ ...editForm, tableCount: Number(v) })}
                                        icon={<School size={14} className="text-slate-400" />} // Replacing Table icon with School/Grid as Table isn't standard Lucide
                                        type="number"
                                    />
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-500">Payment</label>
                                        {isEditing ? (
                                            <div className="relative">
                                                <select
                                                    value={editForm.paymentProcessor}
                                                    onChange={(e) => setEditForm({ ...editForm, paymentProcessor: e.target.value })}
                                                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-1 focus:ring-[#0055FE] outline-none appearance-none"
                                                >
                                                    <option value="stripe">Stripe</option>
                                                    <option value="checkout">Checkout</option>
                                                    <option value="paytabs">PayTabs</option>
                                                </select>
                                                <ChevronDown className="absolute right-3 top-3 text-slate-400 pointer-events-none" size={14} />
                                            </div>
                                        ) : (
                                            <div className="h-10 px-3 bg-slate-100 rounded-lg flex items-center text-sm text-slate-700 capitalize">
                                                <CreditCard size={14} className="mr-2 text-slate-400" />
                                                {selectedRestaurant.paymentProcessor}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {isEditing && (
                                    <button
                                        onClick={handleSaveChanges}
                                        className="w-full mt-6 h-10 bg-[#0055FE] hover:bg-[#0047D1] text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Check size={16} />
                                        Save Changes
                                    </button>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};

// --- Sub-Components ---

const StatCard = ({ label, value, iconColor, rightIcon }: { label: string, value: number, iconColor: string, rightIcon: React.ReactNode }) => (
    <div className="bg-white p-5 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
        <div>
            <div className="flex items-center gap-2 mb-2">
                <Star className={iconColor} size={16} fill="currentColor" />
                <span className="text-xs font-medium text-slate-500">{label}</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        </div>
        <div className="p-2 bg-blue-50/50 rounded-lg text-[#0055FE] opacity-60">
            {rightIcon}
        </div>
    </div>
);

const ReadOnlyField = ({ label, value, icon }: { label: string, value: string | number, icon?: React.ReactNode }) => (
    <div className="space-y-1.5 w-full">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <div className="w-full px-4 py-2.5 bg-slate-100 rounded-lg text-sm text-slate-900 flex items-center gap-2">
            {icon}
            {value || '-'}
        </div>
    </div>
);

const SettingField = ({ label, isEditing, value, onChange, icon, type = "text" }: any) => (
    <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        {isEditing ? (
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-1 focus:ring-[#0055FE] outline-none transition-all"
            />
        ) : (
            <div className="h-10 px-3 bg-slate-100 rounded-lg flex items-center text-sm text-slate-700">
                <span className="mr-2">{icon}</span>
                {value}
            </div>
        )}
    </div>
);

const StatusSelect = ({ value, onChange, isMobile }: { value: string, onChange: (v: string) => void, isMobile?: boolean }) => {
    const config: any = {
        active: { bg: "bg-green-500", label: "Active" },
        on_hold: { bg: "bg-yellow-500", label: "Hold" }, // Spec says "Hold" for display
        inactive: { bg: "bg-red-500", label: "Inactive" }
    };
    const current = config[value] || config.inactive;

    return (
        <div className="relative group">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`
                    appearance-none outline-none cursor-pointer text-center text-xs font-bold text-white
                    ${current.bg}
                    ${isMobile ? "w-full rounded-lg py-2" : "rounded px-2.5 py-1 min-w-[80px] pr-6"}
                `}
            >
                <option value="active" className="bg-white text-slate-900">Active</option>
                <option value="on_hold" className="bg-white text-slate-900">Hold</option>
                <option value="inactive" className="bg-white text-slate-900">Inactive</option>
            </select>
            {!isMobile && <ChevronDown className="absolute right-1 top-1.5 text-white/80 pointer-events-none" size={12} />}
        </div>
    );
};

export default ScreenSuperAdminManagement;
