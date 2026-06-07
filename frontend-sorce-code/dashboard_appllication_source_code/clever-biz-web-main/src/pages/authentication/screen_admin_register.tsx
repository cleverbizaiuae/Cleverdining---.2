import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { Store, MapPin, Upload, Phone as PhoneIcon, Lock, Loader2, User, Eye, EyeOff, CheckCircle } from "lucide-react";
import logo from "../../assets/cleverbiz_full_logo.png";
import registerBg from "../../assets/register-bg.webp";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import { getRegionConfig } from "../../config/regionConfig";

const ScreenAdminRegister = () => {
    const navigate = useNavigate();
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Registration State
    const [formData, setFormData] = useState({
        customerName: "",
        restaurantName: "",
        location: "",
        region: "UAE",
        phoneNumber: "",
        numberOfTables: 10,
        paymentProcessor: "",
        logo: null as File | null,
        email: "",
        password: "",
    });

    // Role Verification
    useEffect(() => {
        const userInfo = localStorage.getItem("userInfo");
        if (userInfo) {
            try {
                const user = JSON.parse(userInfo);
                // Allow legacy and current super-admin representations.
                if (
                    user.is_superuser ||
                    user.role === "super_admin" ||
                    user.role === "admin"
                ) {
                    setIsUnlocked(true);
                } else {
                    toast.error("Unauthorized access.");
                    navigate("/");
                }
            } catch (e) {
                console.error("Error parsing user info", e);
                navigate("/adminlogin");
            }
        } else {
            toast.error("Please login as Super Admin.");
            navigate("/superadmin/login");
        }
    }, [navigate]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const regionSettings = getRegionConfig(formData.region);
            const [cityPart, countryPart] = formData.location
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);

            const primaryPayload = {
                resturent_name: formData.restaurantName,
                location: formData.location,
                region: formData.region,
                city: cityPart || formData.location,
                country: countryPart || regionSettings.countryLabel,
                phone_number: formData.phoneNumber,
                email: formData.email,
                owner_name: formData.customerName,
                package: "Starter",
                plan: "standard",
                subscription_months: 12,
                qr_codes: Number(formData.numberOfTables) || 10,
                table_count: Number(formData.numberOfTables) || 10,
                payment_processor: formData.paymentProcessor || regionSettings.defaultPaymentProvider,
                whatsapp_enabled: false,
                password: formData.password
            };

            try {
                await axiosInstance.post('/owners/registered-restaurants/', primaryPayload);
            } catch (primaryErr: any) {
                const statusCode = primaryErr?.response?.status;
                if (statusCode !== 404 && statusCode !== 405) {
                    throw primaryErr;
                }

                // Legacy fallback for older backend deployments.
                await axiosInstance.post('/restaurant/create/', {
                    name: formData.restaurantName,
                    owner_name: formData.customerName,
                    email: formData.email,
                    password: formData.password,
                    phone_number: formData.phoneNumber,
                    address: formData.location,
                    table_count: Number(formData.numberOfTables) || 10,
                    payment_processor: formData.paymentProcessor
                });
            }

            toast.success("Restaurant registered successfully!");
            navigate("/superadmin/management");
        } catch (error: any) {
            console.error("Registration failed:", error);
            const msg = error.response?.data?.detail || "Registration failed.";
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const renderForm = () => (
        <div className="w-full max-w-md mx-auto py-8">
            <div className="text-center mb-6">
                <img
                    src={logo}
                    alt="CleverBiz"
                    className="h-10 mx-auto mb-6 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate('/')}
                />
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Register New Restaurant</h1>
                <p className="text-base text-slate-500">Add a new restaurant to the platform.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Customer Name */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Owner Name</label>
                    <input
                        data-testid="owner-name"
                        type="text"
                        name="customerName"
                        required
                        value={formData.customerName}
                        onChange={handleInputChange}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                        placeholder="Owner Name"
                    />
                </div>

                {/* Restaurant Name */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Restaurant Name</label>
                    <input
                        data-testid="restaurant-name"
                        type="text"
                        name="restaurantName"
                        required
                        value={formData.restaurantName}
                        onChange={handleInputChange}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                        placeholder="Restaurant Name"
                    />
                </div>

                {/* Location */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Location</label>
                    <input
                        type="text"
                        name="location"
                        required
                        value={formData.location}
                        onChange={handleInputChange}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                        placeholder="City, Country"
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Region / Country</label>
                    <select
                        name="region"
                        value={formData.region}
                        onChange={(e) => {
                            const nextRegion = e.target.value;
                            const regionCfg = getRegionConfig(nextRegion);
                            setFormData((prev) => ({
                                ...prev,
                                region: nextRegion,
                                paymentProcessor: regionCfg.payments.includes(prev.paymentProcessor)
                                    ? prev.paymentProcessor
                                    : regionCfg.defaultPaymentProvider,
                            }));
                        }}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-base text-slate-900 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                    >
                        <option value="UAE">UAE</option>
                        <option value="UK">UK</option>
                    </select>
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Phone Number</label>
                    <input
                        data-testid="mobile-input"
                        type="tel"
                        name="phoneNumber"
                        required
                        value={formData.phoneNumber}
                        onChange={handleInputChange}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                        placeholder="+1234567890"
                    />
                </div>

                {/* Tables & Payment */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-900">Number of Tables</label>
                        <input
                            type="number"
                            name="numberOfTables"
                            min="1"
                            max="500"
                            required
                            value={formData.numberOfTables}
                            onChange={handleInputChange}
                            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                            placeholder="10"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-900">Payment Processor</label>
                        <div className="relative">
                            <select
                                name="paymentProcessor"
                                value={formData.paymentProcessor}
                                onChange={handleInputChange}
                                required
                                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all appearance-none cursor-pointer hover:bg-slate-100"
                            >
                                <option value="" disabled>Select...</option>
                                {getRegionConfig(formData.region).payments
                                    .filter((provider) => provider !== "cash")
                                    .map((provider) => (
                                        <option key={provider} value={provider}>
                                            {provider === "checkout"
                                                ? "Checkout.com"
                                                : provider === "paytabs"
                                                    ? "PayTabs"
                                                    : provider === "payme"
                                                        ? "Payme"
                                                        : "Stripe"}
                                        </option>
                                    ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Logo Upload */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Restaurant Logo (Optional)</label>
                    <div className="w-full border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors group relative">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setFormData({ ...formData, logo: e.target.files?.[0] || null })}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-12 h-12 rounded-full bg-[#0055FE]/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200">
                            <Upload className="w-5 h-5 text-[#0055FE]" />
                        </div>
                        <span className="text-sm font-medium text-slate-500">{formData.logo ? formData.logo.name : "Upload Custom Logo (Optional)"}</span>
                    </div>
                </div>

                {/* Email */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Email</label>
                    <input
                        data-testid="email-input"
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                        placeholder="your@email.com"
                    />
                </div>

                {/* Password */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Password</label>
                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            name="password"
                            required
                            value={formData.password}
                            onChange={handleInputChange}
                            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                            placeholder="Minimum 6 characters"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 outline-none"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    data-testid="submit-btn"
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 mt-2 bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold rounded-lg shadow-[0_10px_15px_rgba(0,85,254,0.2)] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all text-lg"
                >
                    {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : null}
                    {!isLoading && "Register Restaurant"}
                </button>
            </form>
        </div>
    );

    if (!isUnlocked) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center p-6 bg-slate-50 font-inter">
                <Loader2 className="w-8 h-8 text-[#0055FE] animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-white font-inter overflow-hidden">
            {/* Left Panel */}
            <div className="w-full lg:w-1/2 h-full overflow-y-auto px-6">
                {renderForm()}
            </div>

            {/* Right Panel */}
            <div className="hidden lg:flex w-1/2 h-full relative bg-slate-900 overflow-hidden">
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-80 mix-blend-overlay"
                    style={{ backgroundImage: `url(${registerBg})` }}
                ></div>
                {/* Blue tint overlay */}
                <div className="absolute inset-0 bg-[#0055FE]/20 mix-blend-multiply z-10"></div>

                {/* Promotional Text */}
                <div className="absolute bottom-12 left-12 right-12 z-20">
                    <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
                        Grow your network.
                    </h2>
                    <p className="text-white/80 text-lg">
                        Add more restaurants to the most advanced management OS.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ScreenAdminRegister;
