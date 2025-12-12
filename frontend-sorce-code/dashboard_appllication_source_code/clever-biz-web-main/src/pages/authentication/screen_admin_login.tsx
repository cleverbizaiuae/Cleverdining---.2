
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router"; // Fixed import source
import { Eye, EyeOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import axiosInstance from "../../lib/axios";
import logo from "../../assets/cleverbiz_full_logo.png"; // Updated Logo

// Image imports
import heroImage from "../../assets/hero-image-1.webp"; // Using existing asset
import mobileLogo from "../../assets/mobile_logo.png";   // Using existing asset

type PortalRole = "manager" | "staff" | "chef";

const ScreenAdminLogin = () => {
    const navigate = useNavigate();

    // State
    const [selectedRole, setSelectedRole] = useState<PortalRole>("manager");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);

    // Initial load
    useEffect(() => {
        // Optional: Pre-fill from localStorage if needed
        const savedRole = localStorage.getItem("adminRole");
        if (savedRole && ["manager", "staff", "chef"].includes(savedRole)) {
            setSelectedRole(savedRole as PortalRole);
        }
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error("Please enter both email and password");
            return;
        }

        setLoading(true);

        try {
            const response = await axiosInstance.post("/login/", {
                email,
                password
            });

            const { access, refresh, user } = response.data;
            const dbRole = user.role; // "owner", "staff", "chef"

            // Validate against selected Portal
            let isValidRole = false;
            if (selectedRole === "manager" && dbRole === "owner") isValidRole = true;
            if (selectedRole === "staff" && dbRole === "staff") isValidRole = true;
            if (selectedRole === "chef" && dbRole === "chef") isValidRole = true;

            if (!isValidRole) {
                const actualRoleDisplay = dbRole === 'owner' ? 'Manager' : dbRole.charAt(0).toUpperCase() + dbRole.slice(1);
                const selectedRoleDisplay = selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
                toast.error(`Access Denied: You cannot log in as ${selectedRoleDisplay} using ${actualRoleDisplay} credentials.`);
                setLoading(false);
                return;
            }

            // Store Tokens & User Info
            localStorage.setItem("accessToken", access);
            localStorage.setItem("refreshToken", refresh);
            localStorage.setItem("adminRole", dbRole === "owner" ? "manager" : dbRole); // Map backend owner to frontend manager
            localStorage.setItem("role", dbRole);

            // Store User Object
            localStorage.setItem("userInfo", JSON.stringify(user));

            // Store Restaurant ID if available
            if (user.restaurants && user.restaurants.length > 0) {
                localStorage.setItem("restaurantId", user.restaurants[0].id);
            } else if (user.owner_id) {
                // For staff/chef, might not have array but owner_id
                // Logic depends on how frontend uses it. 
                // We'll trust user object storage for now.
            }

            toast.success(`Welcome back, ${user.username || "User"} !`);

            // Role Validation & Redirection
            // We strictly redirect based on the ACTUAL role from DB
            if (dbRole === "owner") {
                navigate("/restaurant"); // Manager Admin Dashboard
            } else if (dbRole === "chef") {
                navigate("/chefadmindashboard");
            } else if (dbRole === "staff") {
                navigate("/staffadmindashboard");
            } else {
                toast.error("Unknown role: " + dbRole);
            }

        } catch (error: any) {
            console.error("Login failed:", error);
            const msg = error.response?.data?.detail || "Login failed. Please check your credentials.";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen font-inter bg-white">

            {/* LEFT SIDE - Form Panel */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 lg:p-16 relative">

                <div className="w-full max-w-md">
                    {/* Header Section */}
                    <div className="flex flex-col items-center mb-8">
                        <img src={logo} alt="CleverBiz AI" className="h-12 w-auto mb-4" /> {/* Adjusted size for full logo */}
                        <h1 className="text-2xl font-bold text-slate-900">Admin Login</h1>
                        <p className="text-sm text-slate-500 mt-1">Sign in to manage your restaurant</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="space-y-6">

                        {/* Portal Selector */}
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-2">Portal</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(["manager", "staff", "chef"] as PortalRole[]).map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => setSelectedRole(role)}
                                        className={`
                                            py-2 px-3 rounded-md text-xs font-medium capitalize transition-all border
                                            ${selectedRole === role
                                                ? "bg-[#0055FE] border-[#0055FE] text-white"
                                                : "bg-transparent border-slate-200 text-slate-600 hover:border-slate-300"
                                            }
                                        `}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                            <input
                                type="email"
                                placeholder="name@company.com"
                                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/10 transition-all"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1.5">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter password"
                                    className="w-full h-10 pl-3 pr-10 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/10 transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Remember & Forgot */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <div className={`
                                    w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors
                                    ${rememberMe ? "bg-[#0055FE] border-[#0055FE]" : "bg-white border-slate-300"}
                                `}>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={rememberMe}
                                        onChange={() => setRememberMe(!rememberMe)}
                                    />
                                    {rememberMe && (
                                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                                <span className="text-xs text-slate-500">Remember me</span>
                            </label>
                            <Link to="/forgot-password" className="text-xs text-[#0055FE] hover:underline">
                                Forgot password?
                            </Link>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-10 bg-[#0055FE] hover:bg-[#0047D1] text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : "Sign in"}
                        </button>

                    </form>

                    {/* Footer Link */}
                    <div className="mt-8 text-center">
                        <p className="text-xs text-slate-500">
                            Don&apos;t have an account?{" "}
                            <Link to="/adminregister" className="text-[#0055FE] font-medium hover:underline">
                                Contact admin
                            </Link>
                        </p>
                    </div>

                </div>
            </div>

            {/* RIGHT SIDE - Image Panel */}
            <div className="hidden lg:block w-1/2 relative bg-slate-900 overflow-hidden">
                <img
                    src={heroImage}
                    alt="Restaurant Interior"
                    className="absolute inset-0 w-full h-full object-cover opacity-60"
                />

                {/* Gradient Overlay */}
                <div
                    className="absolute inset-0 z-10"
                    style={{
                        background: 'linear-gradient(to top, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.4), transparent)'
                    }}
                />

                {/* Text Content */}
                <div className="absolute bottom-16 left-16 right-16 z-20">
                    <h2 className="text-3xl font-semibold text-white mb-2">Restaurant Management</h2>
                    <p className="text-sm text-slate-300">
                        Streamline operations, track orders, and manage your team from one centralized platform.
                    </p>
                </div>
            </div>

        </div>
    );
};

export default ScreenAdminLogin;
