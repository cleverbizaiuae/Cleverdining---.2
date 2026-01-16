import { useState, useMemo } from "react";
import {
    Search,
    Eye,
    Edit2,
    Star,
    Calendar,
    Check,
    X,
    QrCode,
    Plus,
    Trash2,
    ChevronDown,
    Users,
    AlertTriangle,
    Loader2,
    Grid3X3,
    CreditCard
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";

// --- Types ---
interface RegisteredRestaurant {
    id: string;
    name: string;
    location: string;
    city: string;
    country: string;
    phone: string;
    email?: string;
    logoUrl?: string;
    rating?: number;
    package: string;
    status: 'active' | 'on_hold' | 'inactive';
    qrCodes: number;
    tableCount: number;
    paymentProcessor: string;
    subscriptionStart?: string;
    subscriptionEnd?: string;
    createdAt: string;
}

// Seeded Sample Data (12 restaurants)
const SEEDED_RESTAURANTS: RegisteredRestaurant[] = [
    { id: "rest-001", name: "The Golden Fork", location: "Dubai Mall, Level 2", city: "Dubai", country: "UAE", phone: "+971 4 123 4567", email: "contact@goldenfork.ae", rating: 4.8, package: "Professional", status: "active", qrCodes: 15, tableCount: 12, paymentProcessor: "stripe", subscriptionStart: "2025-10-10", createdAt: "2026-01-10T20:39:25.775Z" },
    { id: "rest-002", name: "Spice Route Kitchen", location: "JBR Walk", city: "Dubai", country: "UAE", phone: "+971 4 234 5678", email: "info@spiceroute.ae", rating: 4.5, package: "Enterprise", status: "active", qrCodes: 20, tableCount: 18, paymentProcessor: "stripe", subscriptionStart: "2025-09-15", createdAt: "2026-01-08T15:20:00.000Z" },
    { id: "rest-003", name: "Marina Bites", location: "Dubai Marina", city: "Dubai", country: "UAE", phone: "+971 4 345 6789", email: "hello@marinabites.ae", rating: 3.9, package: "Starter", status: "inactive", qrCodes: 10, tableCount: 8, paymentProcessor: "paytabs", subscriptionStart: "2025-08-01", createdAt: "2025-12-20T10:00:00.000Z" },
    { id: "rest-004", name: "Abu Dhabi Grill House", location: "Yas Mall", city: "Abu Dhabi", country: "UAE", phone: "+971 2 456 7890", email: "reservations@adgrill.ae", rating: 4.7, package: "Enterprise", status: "active", qrCodes: 25, tableCount: 20, paymentProcessor: "stripe", subscriptionStart: "2025-07-20", createdAt: "2025-12-15T14:30:00.000Z" },
    { id: "rest-005", name: "The Corniche Cafe", location: "Corniche Road", city: "Abu Dhabi", country: "UAE", phone: "+971 2 567 8901", email: "info@corniche.ae", rating: 4.2, package: "Enterprise", status: "on_hold", qrCodes: 12, tableCount: 10, paymentProcessor: "checkout", subscriptionStart: "2025-06-10", createdAt: "2025-11-25T09:15:00.000Z" },
    { id: "rest-006", name: "Riyadh Palace Restaurant", location: "Kingdom Centre", city: "Riyadh", country: "Saudi Arabia", phone: "+966 11 123 4567", email: "palace@riyadhpalace.sa", rating: 4.9, package: "Enterprise", status: "active", qrCodes: 30, tableCount: 25, paymentProcessor: "stripe", subscriptionStart: "2025-05-01", createdAt: "2025-11-10T12:00:00.000Z" },
    { id: "rest-007", name: "Jeddah Seafood House", location: "Red Sea Mall", city: "Jeddah", country: "Saudi Arabia", phone: "+966 12 234 5678", email: "jeddah@seafood.sa", rating: 4.3, package: "Professional", status: "active", qrCodes: 18, tableCount: 15, paymentProcessor: "paytabs", subscriptionStart: "2025-04-15", createdAt: "2025-10-20T08:45:00.000Z" },
    { id: "rest-008", name: "Cairo Mezze", location: "City Stars Mall", city: "Cairo", country: "Egypt", phone: "+20 2 345 6789", email: "info@cairomezze.eg", rating: 4.0, package: "Professional", status: "inactive", qrCodes: 15, tableCount: 12, paymentProcessor: "stripe", subscriptionStart: "2025-03-20", createdAt: "2025-09-15T16:30:00.000Z" },
    { id: "rest-009", name: "Nile View Dining", location: "Zamalek", city: "Cairo", country: "Egypt", phone: "+20 2 456 7890", email: "dining@nileview.eg", rating: 4.6, package: "Enterprise", status: "active", qrCodes: 20, tableCount: 16, paymentProcessor: "stripe", subscriptionStart: "2025-02-28", createdAt: "2025-09-01T11:00:00.000Z" },
    { id: "rest-010", name: "Doha Delights", location: "The Pearl Qatar", city: "Doha", country: "Qatar", phone: "+974 4 567 8901", email: "info@dohadelights.qa", rating: 4.4, package: "Enterprise", status: "active", qrCodes: 22, tableCount: 18, paymentProcessor: "checkout", subscriptionStart: "2025-01-15", createdAt: "2025-08-20T13:15:00.000Z" },
    { id: "rest-011", name: "Kuwait Kitchen", location: "The Avenues Mall", city: "Kuwait City", country: "Kuwait", phone: "+965 2 678 9012", email: "kitchen@kuwait.kw", rating: 4.1, package: "Professional", status: "on_hold", qrCodes: 14, tableCount: 11, paymentProcessor: "paytabs", subscriptionStart: "2024-12-01", createdAt: "2025-08-10T10:30:00.000Z" },
    { id: "rest-012", name: "Bahrain Brasserie", location: "Seef Mall", city: "Manama", country: "Bahrain", phone: "+973 1789 0123", email: "brasserie@bahrain.bh", rating: 4.5, package: "Professional", status: "active", qrCodes: 16, tableCount: 13, paymentProcessor: "stripe", subscriptionStart: "2024-11-10", createdAt: "2025-08-01T09:00:00.000Z" },
];

const COUNTRIES = ["UAE", "Saudi Arabia", "Egypt", "Qatar", "Kuwait", "Bahrain"];
const CITIES: Record<string, string[]> = {
    "UAE": ["Dubai", "Abu Dhabi", "Sharjah"],
    "Saudi Arabia": ["Riyadh", "Jeddah", "Dammam"],
    "Egypt": ["Cairo", "Alexandria", "Giza"],
    "Qatar": ["Doha"],
    "Kuwait": ["Kuwait City"],
    "Bahrain": ["Manama"]
};

const ScreenSuperAdminManagement = () => {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState("");

    // Modal States
    const [selectedRestaurant, setSelectedRestaurant] = useState<RegisteredRestaurant | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [restaurantToDelete, setRestaurantToDelete] = useState<RegisteredRestaurant | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");

    // Edit Form
    const [editForm, setEditForm] = useState({
        qrCodes: 10,
        tableCount: 10,
        paymentProcessor: "stripe",
        package: "Starter"
    });

    // Add Form
    const [newRestaurant, setNewRestaurant] = useState({
        name: "",
        location: "",
        city: "Dubai",
        country: "UAE",
        phone: "",
        email: "",
        qrCodes: 10,
        tableCount: 10,
        paymentProcessor: "stripe",
        package: "Starter",
        subscriptionMonths: 12
    });

    // --- Queries ---
    const { data: restaurants = SEEDED_RESTAURANTS, isLoading } = useQuery<RegisteredRestaurant[]>({
        queryKey: ['registered-restaurants'],
        queryFn: async () => {
            try {
                const response = await axiosInstance.get('/api/registered-restaurants');
                return response.data;
            } catch {
                return SEEDED_RESTAURANTS;
            }
        },
        initialData: SEEDED_RESTAURANTS
    });

    // --- Mutations ---
    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            const response = await axiosInstance.patch(`/api/registered-restaurants/${id}`, { status });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registered-restaurants'] });
            toast.success("Status updated");
        },
        onError: () => {
            toast.error("Failed to update status");
        }
    });

    const updateRestaurantMutation = useMutation({
        mutationFn: async (data: { id: string; qrCodes: number; tableCount: number; paymentProcessor: string; package: string }) => {
            const response = await axiosInstance.patch(`/api/registered-restaurants/${data.id}`, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registered-restaurants'] });
            toast.success("Restaurant updated");
            setIsEditing(false);
        },
        onError: () => {
            toast.error("Failed to update");
        }
    });

    const createRestaurantMutation = useMutation({
        mutationFn: async (data: typeof newRestaurant) => {
            const response = await axiosInstance.post('/api/registered-restaurants', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registered-restaurants'] });
            toast.success("Restaurant added");
            setIsAddOpen(false);
            setNewRestaurant({
                name: "", location: "", city: "Dubai", country: "UAE", phone: "", email: "",
                qrCodes: 10, tableCount: 10, paymentProcessor: "stripe", package: "Starter", subscriptionMonths: 12
            });
        },
        onError: () => {
            toast.error("Failed to add restaurant");
        }
    });

    const deleteRestaurantMutation = useMutation({
        mutationFn: async (id: string) => {
            const response = await axiosInstance.delete(`/api/registered-restaurants/${id}`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['registered-restaurants'] });
            toast.success("Restaurant deleted");
            setIsDeleteOpen(false);
            setRestaurantToDelete(null);
            setDeleteConfirmText("");
            setSelectedRestaurant(null);
        },
        onError: () => {
            toast.error("Failed to delete");
        }
    });

    // --- Computed ---
    const filteredRestaurants = useMemo(() => {
        const lowerQ = searchQuery.toLowerCase();
        return restaurants.filter(r =>
            r.name.toLowerCase().includes(lowerQ) ||
            r.city.toLowerCase().includes(lowerQ) ||
            r.country.toLowerCase().includes(lowerQ)
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
            paymentProcessor: r.paymentProcessor,
            package: r.package
        });
        setIsEditing(false);
    };

    const handleCloseModal = () => {
        setSelectedRestaurant(null);
        setIsEditing(false);
    };

    const handleSaveChanges = () => {
        if (selectedRestaurant) {
            updateRestaurantMutation.mutate({
                id: selectedRestaurant.id,
                ...editForm
            });
        }
    };

    const handleStatusChange = (id: string, newStatus: string) => {
        updateStatusMutation.mutate({ id, status: newStatus });
    };

    const handleOpenDelete = (r: RegisteredRestaurant) => {
        setRestaurantToDelete(r);
        setDeleteConfirmText("");
        setIsDeleteOpen(true);
    };

    const handleConfirmDelete = () => {
        if (restaurantToDelete && deleteConfirmText.toLowerCase() === "delete") {
            deleteRestaurantMutation.mutate(restaurantToDelete.id);
        }
    };

    const handleAddSubmit = () => {
        if (newRestaurant.name && newRestaurant.location) {
            createRestaurantMutation.mutate(newRestaurant);
        }
    };

    // Package badge styling
    const getPackageStyle = (pkg: string) => {
        switch (pkg) {
            case 'Starter': return 'bg-slate-100 text-slate-600';
            case 'Professional': return 'bg-blue-100 text-blue-700';
            case 'Enterprise': return 'bg-purple-100 text-purple-700';
            case 'Premium': return 'bg-amber-100 text-amber-700';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    // Status styling
    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-700';
            case 'on_hold': return 'bg-amber-100 text-amber-700';
            case 'inactive': return 'bg-red-100 text-red-700';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-[#0055FE]" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">

            {/* --- Stats Cards --- */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Total Restaurants" value={stats.total} icon={<Users size={18} />} color="blue" />
                <StatCard label="On Hold" value={stats.onHold} icon={<AlertTriangle size={18} />} color="amber" />
                <StatCard label="Active Today" value={stats.active} icon={<Check size={18} />} color="green" />
            </div>

            {/* --- Search & Add Section --- */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h2 className="text-lg font-semibold text-slate-900">Subscriber Management</h2>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search by name, city, country..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-[#0055FE] focus:border-[#0055FE] outline-none"
                        />
                    </div>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="h-10 px-4 bg-[#0055FE] hover:bg-[#0047D1] text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                        <Plus size={16} />
                        Add
                    </button>
                </div>
            </div>

            {/* --- Restaurant Table --- */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium uppercase text-slate-500">
                            <tr>
                                <th className="px-6 py-3">Restaurant</th>
                                <th className="px-6 py-3">Location</th>
                                <th className="px-6 py-3">Package</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRestaurants.length > 0 ? filteredRestaurants.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                    {/* Restaurant Column - Name, Email, Rating */}
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-slate-900">{r.name}</div>
                                        <div className="text-xs text-slate-500">{r.email || '-'}</div>
                                        {r.rating && (
                                            <div className="flex items-center gap-1 mt-1">
                                                <Star size={12} className="text-amber-400 fill-amber-400" />
                                                <span className="text-xs text-slate-600">{r.rating}</span>
                                            </div>
                                        )}
                                    </td>
                                    {/* Location Column */}
                                    <td className="px-6 py-4 text-sm text-slate-600">
                                        {r.city}, {r.country}
                                    </td>
                                    {/* Package Badge */}
                                    <td className="px-6 py-4">
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${getPackageStyle(r.package)}`}>
                                            {r.package}
                                        </span>
                                    </td>
                                    {/* Status Dropdown */}
                                    <td className="px-6 py-4">
                                        <div className="relative">
                                            <select
                                                value={r.status}
                                                onChange={(e) => handleStatusChange(r.id, e.target.value)}
                                                className={`appearance-none cursor-pointer text-xs font-medium px-3 py-1.5 pr-7 rounded-full outline-none ${getStatusStyle(r.status)}`}
                                            >
                                                <option value="active">Active</option>
                                                <option value="on_hold">On Hold</option>
                                                <option value="inactive">Inactive</option>
                                            </select>
                                            <ChevronDown className="absolute right-2 top-2 pointer-events-none" size={12} />
                                        </div>
                                    </td>
                                    {/* Actions */}
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => handleView(r)}
                                            className="p-2 text-[#0055FE] hover:bg-blue-50 rounded-lg transition-colors"
                                            title="View Details"
                                        >
                                            <Eye size={16} />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                                        No restaurants found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- View/Edit Modal --- */}
            {selectedRestaurant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Restaurant Details</h3>
                                <p className="text-xs text-slate-500">{selectedRestaurant.name}</p>
                            </div>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Read-Only Fields */}
                            <div className="space-y-4">
                                <ReadOnlyField label="Restaurant Name" value={selectedRestaurant.name} />
                                <ReadOnlyField label="Email" value={selectedRestaurant.email || '-'} />
                                <ReadOnlyField label="Location" value={`${selectedRestaurant.location}, ${selectedRestaurant.city}, ${selectedRestaurant.country}`} />
                                <div className="grid grid-cols-2 gap-4">
                                    <ReadOnlyField label="Phone" value={selectedRestaurant.phone} />
                                    <ReadOnlyField label="Subscription Start" value={selectedRestaurant.subscriptionStart || '-'} icon={<Calendar size={14} className="text-[#0055FE]" />} />
                                </div>
                            </div>

                            {/* Editable Settings Section */}
                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-sm font-bold text-slate-900">Settings</h4>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className="text-xs font-medium text-[#0055FE] hover:underline flex items-center gap-1"
                                    >
                                        <Edit2 size={12} />
                                        {isEditing ? "Cancel" : "Edit"}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <SettingField
                                        label="QR Codes"
                                        isEditing={isEditing}
                                        value={isEditing ? editForm.qrCodes : selectedRestaurant.qrCodes}
                                        onChange={(v) => setEditForm({ ...editForm, qrCodes: Number(v) })}
                                        icon={<QrCode size={14} />}
                                        type="number"
                                    />
                                    <SettingField
                                        label="Tables"
                                        isEditing={isEditing}
                                        value={isEditing ? editForm.tableCount : selectedRestaurant.tableCount}
                                        onChange={(v) => setEditForm({ ...editForm, tableCount: Number(v) })}
                                        icon={<Grid3X3 size={14} />}
                                        type="number"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-500">Payment</label>
                                        {isEditing ? (
                                            <select
                                                value={editForm.paymentProcessor}
                                                onChange={(e) => setEditForm({ ...editForm, paymentProcessor: e.target.value })}
                                                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#0055FE] outline-none"
                                            >
                                                <option value="stripe">Stripe</option>
                                                <option value="checkout">Checkout</option>
                                                <option value="paytabs">PayTabs</option>
                                            </select>
                                        ) : (
                                            <div className="h-10 px-3 bg-slate-100 rounded-lg flex items-center text-sm text-slate-700 capitalize">
                                                <CreditCard size={14} className="mr-2 text-slate-400" />
                                                {selectedRestaurant.paymentProcessor}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-500">Package</label>
                                        {isEditing ? (
                                            <select
                                                value={editForm.package}
                                                onChange={(e) => setEditForm({ ...editForm, package: e.target.value })}
                                                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#0055FE] outline-none"
                                            >
                                                <option value="Starter">Starter</option>
                                                <option value="Professional">Professional</option>
                                                <option value="Enterprise">Enterprise</option>
                                            </select>
                                        ) : (
                                            <div className="h-10 px-3 bg-slate-100 rounded-lg flex items-center text-sm text-slate-700">
                                                {selectedRestaurant.package}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {isEditing && (
                                    <button
                                        onClick={handleSaveChanges}
                                        disabled={updateRestaurantMutation.isPending}
                                        className="w-full mt-6 h-10 bg-[#0055FE] hover:bg-[#0047D1] disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        {updateRestaurantMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                                        Save Changes
                                    </button>
                                )}
                            </div>

                            {/* Delete Button */}
                            <div className="pt-4 border-t border-slate-100">
                                <button
                                    onClick={() => handleOpenDelete(selectedRestaurant)}
                                    className="w-full h-10 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    Delete Restaurant
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Add Restaurant Modal --- */}
            {isAddOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-900">Add New Restaurant</h3>
                            <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <InputField label="Restaurant Name *" value={newRestaurant.name} onChange={(v) => setNewRestaurant({ ...newRestaurant, name: v })} />
                                <InputField label="Email" value={newRestaurant.email} onChange={(v) => setNewRestaurant({ ...newRestaurant, email: v })} type="email" />
                            </div>
                            <InputField label="Location *" value={newRestaurant.location} onChange={(v) => setNewRestaurant({ ...newRestaurant, location: v })} />
                            <div className="grid grid-cols-2 gap-4">
                                <SelectField label="Country" value={newRestaurant.country} options={COUNTRIES} onChange={(v) => setNewRestaurant({ ...newRestaurant, country: v, city: CITIES[v]?.[0] || "" })} />
                                <SelectField label="City" value={newRestaurant.city} options={CITIES[newRestaurant.country] || []} onChange={(v) => setNewRestaurant({ ...newRestaurant, city: v })} />
                            </div>
                            <InputField label="Phone" value={newRestaurant.phone} onChange={(v) => setNewRestaurant({ ...newRestaurant, phone: v })} />
                            <div className="grid grid-cols-2 gap-4">
                                <InputField label="QR Codes" value={newRestaurant.qrCodes} onChange={(v) => setNewRestaurant({ ...newRestaurant, qrCodes: Number(v) })} type="number" />
                                <InputField label="Tables" value={newRestaurant.tableCount} onChange={(v) => setNewRestaurant({ ...newRestaurant, tableCount: Number(v) })} type="number" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <SelectField label="Payment Processor" value={newRestaurant.paymentProcessor} options={["stripe", "checkout", "paytabs"]} onChange={(v) => setNewRestaurant({ ...newRestaurant, paymentProcessor: v })} />
                                <SelectField label="Package" value={newRestaurant.package} options={["Starter", "Professional", "Enterprise"]} onChange={(v) => setNewRestaurant({ ...newRestaurant, package: v })} />
                            </div>

                            <button
                                onClick={handleAddSubmit}
                                disabled={!newRestaurant.name || !newRestaurant.location || createRestaurantMutation.isPending}
                                className="w-full mt-4 h-10 bg-[#0055FE] hover:bg-[#0047D1] disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                {createRestaurantMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                Add Restaurant
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Delete Confirmation Modal --- */}
            {isDeleteOpen && restaurantToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 shadow-2xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-red-100 rounded-full">
                                <AlertTriangle className="text-red-600" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Delete Restaurant</h3>
                                <p className="text-xs text-slate-500">This action cannot be undone</p>
                            </div>
                        </div>

                        <p className="text-sm text-slate-600 mb-4">
                            Are you sure you want to delete <strong>{restaurantToDelete.name}</strong>? Type <strong>"delete"</strong> to confirm.
                        </p>

                        <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder='Type "delete" to confirm'
                            className="w-full h-10 px-4 bg-white border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-red-500 outline-none mb-4"
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setIsDeleteOpen(false); setDeleteConfirmText(""); }}
                                className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={deleteConfirmText.toLowerCase() !== "delete" || deleteRestaurantMutation.isPending}
                                className="flex-1 h-10 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                {deleteRestaurantMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Sub-Components ---

const StatCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => {
    const colorStyles: Record<string, string> = {
        blue: "bg-blue-50 text-[#0055FE]",
        amber: "bg-amber-50 text-amber-600",
        green: "bg-green-50 text-green-600"
    };
    return (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 rounded-lg ${colorStyles[color]}`}>{icon}</div>
                <span className="text-xs font-medium text-slate-500">{label}</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        </div>
    );
};

const ReadOnlyField = ({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <div className="px-4 py-2.5 bg-slate-100 rounded-lg text-sm text-slate-900 flex items-center gap-2">
            {icon}{value || '-'}
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
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#0055FE] outline-none"
            />
        ) : (
            <div className="h-10 px-3 bg-slate-100 rounded-lg flex items-center text-sm text-slate-700">
                <span className="mr-2 text-slate-400">{icon}</span>{value}
            </div>
        )}
    </div>
);

const InputField = ({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#0055FE] outline-none"
        />
    </div>
);

const SelectField = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-[#0055FE] outline-none capitalize"
        >
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);

export default ScreenSuperAdminManagement;
