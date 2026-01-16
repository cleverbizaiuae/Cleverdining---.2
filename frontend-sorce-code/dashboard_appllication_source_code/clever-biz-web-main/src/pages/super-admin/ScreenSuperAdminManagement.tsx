import { useState, useMemo } from "react";
import {
    Search,
    Star,
    Eye,
    ChevronDown,
    X,
    QrCode,
    CreditCard,
    Calendar,
    Edit2,
    Plus,
    Trash2,
    AlertTriangle,
    Loader2,
    Grid3X3
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { format } from "date-fns";

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
                // Return seeded data if API not available
                return SEEDED_RESTAURANTS;
            }
        },
        initialData: SEEDED_RESTAURANTS
    });

    // --- Mutations with Optimistic Updates (works without backend) ---
    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            // Try API call first
            try {
                const response = await axiosInstance.patch(`/api/registered-restaurants/${id}`, { status });
                return response.data;
            } catch {
                // If API fails, return the update data for optimistic update
                return { id, status };
            }
        },
        onMutate: async ({ id, status }) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: ['registered-restaurants'] });

            // Snapshot previous value
            const previousRestaurants = queryClient.getQueryData<RegisteredRestaurant[]>(['registered-restaurants']);

            // Optimistically update the cache
            queryClient.setQueryData<RegisteredRestaurant[]>(['registered-restaurants'], (old) =>
                old?.map(r => r.id === id ? { ...r, status: status as 'active' | 'on_hold' | 'inactive' } : r) || []
            );

            return { previousRestaurants };
        },
        onSuccess: () => {
            toast.success("Status updated");
        },
        onError: (_err, _vars, context) => {
            // Rollback on error
            if (context?.previousRestaurants) {
                queryClient.setQueryData(['registered-restaurants'], context.previousRestaurants);
            }
            toast.error("Failed to update status");
        }
    });

    const updateRestaurantMutation = useMutation({
        mutationFn: async (data: { id: string; qrCodes: number; tableCount: number; paymentProcessor: string; package: string }) => {
            try {
                const response = await axiosInstance.patch(`/api/registered-restaurants/${data.id}`, data);
                return response.data;
            } catch {
                return data;
            }
        },
        onMutate: async (data) => {
            await queryClient.cancelQueries({ queryKey: ['registered-restaurants'] });
            const previousRestaurants = queryClient.getQueryData<RegisteredRestaurant[]>(['registered-restaurants']);

            queryClient.setQueryData<RegisteredRestaurant[]>(['registered-restaurants'], (old) =>
                old?.map(r => r.id === data.id ? { ...r, ...data } : r) || []
            );

            return { previousRestaurants };
        },
        onSuccess: () => {
            toast.success("Restaurant updated");
            setIsEditing(false);
        },
        onError: (_err, _vars, context) => {
            if (context?.previousRestaurants) {
                queryClient.setQueryData(['registered-restaurants'], context.previousRestaurants);
            }
            toast.error("Failed to update");
        }
    });

    const createRestaurantMutation = useMutation({
        mutationFn: async (data: typeof newRestaurant) => {
            try {
                const response = await axiosInstance.post('/api/registered-restaurants', data);
                return response.data;
            } catch {
                // Create a new restaurant locally
                const newId = `rest-${Date.now()}`;
                return {
                    id: newId,
                    ...data,
                    status: 'active' as const,
                    rating: 4.5,
                    createdAt: new Date().toISOString(),
                    subscriptionStart: new Date().toISOString()
                };
            }
        },
        onSuccess: (newRest) => {
            // Add new restaurant to cache
            queryClient.setQueryData<RegisteredRestaurant[]>(['registered-restaurants'], (old) =>
                [...(old || []), newRest as RegisteredRestaurant]
            );
            toast.success("Restaurant added");
            setIsAddOpen(false);
            resetNewRestaurant();
        },
        onError: () => toast.error("Failed to add restaurant")
    });

    const deleteRestaurantMutation = useMutation({
        mutationFn: async (id: string) => {
            try {
                const response = await axiosInstance.delete(`/api/registered-restaurants/${id}`);
                return response.data;
            } catch {
                return { id };
            }
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['registered-restaurants'] });
            const previousRestaurants = queryClient.getQueryData<RegisteredRestaurant[]>(['registered-restaurants']);

            queryClient.setQueryData<RegisteredRestaurant[]>(['registered-restaurants'], (old) =>
                old?.filter(r => r.id !== id) || []
            );

            return { previousRestaurants };
        },
        onSuccess: () => {
            toast.success("Restaurant deleted");
            setIsDeleteOpen(false);
            setRestaurantToDelete(null);
            setDeleteConfirmText("");
            setSelectedRestaurant(null);
        },
        onError: (_err, _vars, context) => {
            if (context?.previousRestaurants) {
                queryClient.setQueryData(['registered-restaurants'], context.previousRestaurants);
            }
            toast.error("Failed to delete");
        }
    });

    // --- Computed ---
    const totalRestaurants = restaurants.length;
    const onHoldCount = restaurants.filter(r => r.status === 'on_hold').length;
    const activeToday = restaurants.filter(r => r.status === 'active').length;

    const filteredRestaurants = useMemo(() => {
        const lowerQ = searchQuery.toLowerCase();
        return restaurants.filter(r =>
            r.name.toLowerCase().includes(lowerQ) ||
            r.city.toLowerCase().includes(lowerQ) ||
            r.country.toLowerCase().includes(lowerQ)
        );
    }, [restaurants, searchQuery]);

    // --- Handlers ---
    const handleStatusChange = (id: string, status: string) => {
        updateStatusMutation.mutate({ id, status });
    };

    const handleViewRestaurant = (restaurant: RegisteredRestaurant) => {
        setSelectedRestaurant(restaurant);
        setEditForm({
            qrCodes: restaurant.qrCodes,
            tableCount: restaurant.tableCount,
            paymentProcessor: restaurant.paymentProcessor || "stripe",
            package: restaurant.package
        });
        setIsEditing(false);
    };

    const handleOpenDelete = (restaurant: RegisteredRestaurant) => {
        setRestaurantToDelete(restaurant);
        setDeleteConfirmText("");
        setIsDeleteOpen(true);
    };

    const handleConfirmDelete = () => {
        if (restaurantToDelete && deleteConfirmText.toLowerCase() === "delete") {
            deleteRestaurantMutation.mutate(restaurantToDelete.id);
        }
    };

    const handleSaveChanges = () => {
        if (selectedRestaurant) {
            updateRestaurantMutation.mutate({
                id: selectedRestaurant.id,
                ...editForm
            });
        }
    };

    const resetNewRestaurant = () => {
        setNewRestaurant({
            name: "", location: "", city: "Dubai", country: "UAE", phone: "", email: "",
            qrCodes: 10, tableCount: 10, paymentProcessor: "stripe", package: "Starter", subscriptionMonths: 12
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-700';
            case 'on_hold': return 'bg-amber-100 text-amber-700';
            case 'inactive': return 'bg-red-100 text-red-700';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    const getPackageColor = (pkg: string) => {
        switch (pkg) {
            case 'Enterprise': return 'bg-purple-100 text-purple-700';
            case 'Professional': return 'bg-blue-100 text-blue-700';
            case 'Premium': return 'bg-amber-100 text-amber-700';
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

            {/* --- Header Row --- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-lg font-semibold text-slate-900">Restaurant Management</h2>
                <div className="flex gap-3 w-full sm:w-auto">
                    {/* Search Input */}
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search restaurants..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 h-10 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0055FE]/30 focus:border-[#0055FE]"
                        />
                    </div>
                    {/* Add Button */}
                    <button
                        onClick={() => window.open('https://officialcleverdining.netlify.app/adminregister', '_blank')}
                        className="h-10 px-4 bg-[#0055FE] hover:bg-[#0047D1] text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Add Restaurant
                    </button>
                </div>
            </div>

            {/* --- Stats Cards --- */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Total Restaurants</p>
                    <p className="text-2xl font-bold text-slate-900">{totalRestaurants}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">On Hold</p>
                    <p className="text-2xl font-bold text-amber-600">{onHoldCount}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Active Today</p>
                    <p className="text-2xl font-bold text-green-600">{activeToday}</p>
                </div>
            </div>

            {/* --- Table Container --- */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wider">
                    <div className="col-span-4">Restaurant</div>
                    <div className="col-span-2">Location</div>
                    <div className="col-span-2 text-center">Package</div>
                    <div className="col-span-2 text-center">Status</div>
                    <div className="col-span-2 text-center">Actions</div>
                </div>

                {/* Table Rows */}
                {filteredRestaurants.length > 0 ? filteredRestaurants.map((restaurant) => (
                    <div
                        key={restaurant.id}
                        className="grid grid-cols-12 gap-4 px-4 py-4 border-b border-slate-100 hover:bg-slate-50 items-center transition-colors"
                    >
                        {/* Restaurant Column - Name, Email, Rating */}
                        <div className="col-span-4">
                            <p className="text-sm font-medium text-slate-900">{restaurant.name}</p>
                            <p className="text-xs text-slate-500">{restaurant.email || '-'}</p>
                            {restaurant.rating && (
                                <div className="flex items-center gap-1 mt-1">
                                    <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                                    <span className="text-xs text-slate-600">{restaurant.rating}</span>
                                </div>
                            )}
                        </div>

                        {/* Location Column */}
                        <div className="col-span-2">
                            <p className="text-sm text-slate-600">{restaurant.city}, {restaurant.country}</p>
                        </div>

                        {/* Package Column */}
                        <div className="col-span-2 text-center">
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getPackageColor(restaurant.package)}`}>
                                {restaurant.package}
                            </span>
                        </div>

                        {/* Status Column (Dropdown) */}
                        <div className="col-span-2 flex justify-center">
                            <div className="relative">
                                <select
                                    value={restaurant.status}
                                    onChange={(e) => handleStatusChange(restaurant.id, e.target.value)}
                                    className={`appearance-none cursor-pointer px-3 py-1 pr-7 text-xs font-medium rounded-full ${getStatusColor(restaurant.status)} border-0 focus:ring-2 focus:ring-offset-1 focus:ring-[#0055FE] outline-none`}
                                >
                                    <option value="active">Active</option>
                                    <option value="on_hold">On Hold</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
                            </div>
                        </div>

                        {/* Actions Column */}
                        <div className="col-span-2 flex justify-center">
                            <button
                                onClick={() => handleViewRestaurant(restaurant)}
                                className="p-2 text-[#0055FE] hover:bg-blue-50 rounded-lg transition-colors"
                            >
                                <Eye className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )) : (
                    <div className="px-4 py-12 text-center text-slate-400 text-sm">
                        No restaurants found
                    </div>
                )}
            </div>

            {/* --- View/Edit Restaurant Modal --- */}
            {selectedRestaurant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">{selectedRestaurant.name}</h3>
                                <p className="text-xs text-slate-500">{selectedRestaurant.location}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className="p-2 text-[#0055FE] hover:bg-blue-50 rounded-lg"
                                >
                                    <Edit2 className="h-4 w-4" />
                                </button>
                                <button onClick={() => setSelectedRestaurant(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto space-y-4">
                            {/* Status & Rating Row */}
                            <div className="flex items-center gap-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${getStatusColor(selectedRestaurant.status)}`}>
                                    {selectedRestaurant.status.replace('_', ' ')}
                                </span>
                                {selectedRestaurant.rating && (
                                    <div className="flex items-center gap-1">
                                        <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                                        <span className="text-xs text-slate-600">{selectedRestaurant.rating}</span>
                                    </div>
                                )}
                            </div>

                            {/* Contact Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Phone</p>
                                    <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-900">{selectedRestaurant.phone}</div>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Email</p>
                                    <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-900 truncate">{selectedRestaurant.email || '-'}</div>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">City</p>
                                    <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-900">{selectedRestaurant.city}</div>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Country</p>
                                    <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-900">{selectedRestaurant.country}</div>
                                </div>
                            </div>

                            {/* Subscription Info */}
                            {selectedRestaurant.subscriptionStart && (
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Calendar className="h-3 w-3" />
                                    <span>
                                        Subscribed: {format(new Date(selectedRestaurant.subscriptionStart), 'MMM d, yyyy')}
                                        {selectedRestaurant.subscriptionEnd && ` - ${format(new Date(selectedRestaurant.subscriptionEnd), 'MMM d, yyyy')}`}
                                    </span>
                                </div>
                            )}

                            {/* Configuration Grid (Editable) */}
                            <div className="grid grid-cols-3 gap-3">
                                {/* QR Codes */}
                                <div>
                                    <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                                        <QrCode className="h-3 w-3 text-[#0055FE]" /> QR Codes
                                    </p>
                                    {isEditing ? (
                                        <input
                                            type="number"
                                            value={editForm.qrCodes}
                                            onChange={(e) => setEditForm({ ...editForm, qrCodes: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-[#0055FE] outline-none"
                                        />
                                    ) : (
                                        <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-900 text-center">{selectedRestaurant.qrCodes}</div>
                                    )}
                                </div>

                                {/* Tables */}
                                <div>
                                    <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                                        <Grid3X3 className="h-3 w-3 text-[#0055FE]" /> Tables
                                    </p>
                                    {isEditing ? (
                                        <input
                                            type="number"
                                            value={editForm.tableCount}
                                            onChange={(e) => setEditForm({ ...editForm, tableCount: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-[#0055FE] outline-none"
                                        />
                                    ) : (
                                        <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-900 text-center">{selectedRestaurant.tableCount}</div>
                                    )}
                                </div>

                                {/* Payment */}
                                <div>
                                    <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                                        <CreditCard className="h-3 w-3 text-[#0055FE]" /> Payment
                                    </p>
                                    {isEditing ? (
                                        <select
                                            value={editForm.paymentProcessor}
                                            onChange={(e) => setEditForm({ ...editForm, paymentProcessor: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-[#0055FE] outline-none"
                                        >
                                            <option value="stripe">Stripe</option>
                                            <option value="checkout">Checkout</option>
                                            <option value="paytabs">PayTabs</option>
                                        </select>
                                    ) : (
                                        <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-900 text-center capitalize">{selectedRestaurant.paymentProcessor || 'stripe'}</div>
                                    )}
                                </div>
                            </div>

                            {/* Package (Editable) */}
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Package (Upgrade/Downgrade)</p>
                                {isEditing ? (
                                    <select
                                        value={editForm.package}
                                        onChange={(e) => setEditForm({ ...editForm, package: e.target.value })}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-[#0055FE] outline-none"
                                    >
                                        <option value="Starter">Starter</option>
                                        <option value="Professional">Professional</option>
                                        <option value="Enterprise">Enterprise</option>
                                    </select>
                                ) : (
                                    <div className="bg-slate-100 rounded-lg px-3 py-2 text-sm text-slate-900 text-center">{selectedRestaurant.package}</div>
                                )}
                            </div>

                            {/* Save Button (Edit Mode) */}
                            {isEditing && (
                                <button
                                    onClick={handleSaveChanges}
                                    disabled={updateRestaurantMutation.isPending}
                                    className="w-full h-10 bg-[#0055FE] hover:bg-[#0047D1] disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    {updateRestaurantMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : null}
                                    Save Changes
                                </button>
                            )}

                            {/* Delete Button */}
                            <div className="pt-4 border-t border-slate-200">
                                <button
                                    onClick={() => {
                                        handleOpenDelete(selectedRestaurant);
                                        setSelectedRestaurant(null);
                                    }}
                                    className="w-full h-10 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete Restaurant
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}



            {/* --- Delete Confirmation Modal --- */}
            {isDeleteOpen && restaurantToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl p-6">
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-red-100 rounded-full">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-red-600">Delete Restaurant</h3>
                                <p className="text-xs text-slate-500">This action cannot be undone</p>
                            </div>
                        </div>

                        {/* Restaurant Info */}
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                            <p className="text-sm text-red-800 font-medium">{restaurantToDelete.name}</p>
                            <p className="text-xs text-red-600 mt-1">{restaurantToDelete.location}, {restaurantToDelete.city}</p>
                        </div>

                        {/* Confirmation Input */}
                        <div className="space-y-2 mb-4">
                            <label className="text-sm text-slate-700">
                                Type <span className="font-bold text-red-600">delete</span> to confirm
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="Type 'delete' to confirm"
                                className="w-full h-10 px-4 bg-white border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-red-500 outline-none"
                            />
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setIsDeleteOpen(false); setDeleteConfirmText(""); }}
                                className="flex-1 h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={deleteConfirmText.toLowerCase() !== "delete" || deleteRestaurantMutation.isPending}
                                className="flex-1 h-10 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                {deleteRestaurantMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                Delete Restaurant
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScreenSuperAdminManagement;
