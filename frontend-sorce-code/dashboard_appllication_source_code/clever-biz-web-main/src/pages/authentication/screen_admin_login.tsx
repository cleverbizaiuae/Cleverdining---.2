import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";

const ScreenAdminLogin = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: "",
        password: "",
        role: "manager", // Default role
    });
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRoleSelect = (role: string) => {
        setFormData({ ...formData, role });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await axiosInstance.post(`/staff/login/`, formData);

            const { access, refresh, role, name, restaurant_id } = response.data;

            // Store Tokens
            localStorage.setItem("accessToken", access);
            localStorage.setItem("refreshToken", refresh);
            localStorage.setItem("role", role);
            localStorage.setItem("userInfo", JSON.stringify({ username: name, role, restaurant_id }));

            // Also set the legacy key "adminRole" as per request history, if needed, 
            // but standardized approach is above. 
            localStorage.setItem("adminRole", role);

            toast.success(`Welcome back, ${name}!`);

            // Redirect Logic
            if (role === "manager") {
                navigate("/restaurant"); // Mapped from /manageradmindashboard
            } else if (role === "staff") {
                navigate("/staff"); // Mapped from /staffadmindashboard
            } else if (role === "chef") {
                navigate("/chef"); // Mapped from /chefadmindashboard
            } else {
                navigate("/admin"); // Fallback
            }

        } catch (error: any) {
            console.error(error);
            const msg = error.response?.data?.error || "Login failed. Please check your credentials.";
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-white font-inter">
            {/* Left Panel - Login Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-12 lg:px-24 xl:px-32 py-12">
                <div className="max-w-[480px] w-full mx-auto">

                    <div className="mb-10">
                        <h1 className="text-[32px] font-bold text-slate-900 mb-2">Welcome Back</h1>
                        <p className="text-slate-500 text-lg">Sign in to your dashboard to manage your restaurant.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* Role Selection */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-600 block">Select Portal</label>
                            <div className="grid grid-cols-3 gap-3">
                                {['manager', 'staff', 'chef'].map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => handleRoleSelect(role)}
                                        className={`
                        py-2.5 px-4 rounded-lg text-sm font-medium capitalize transition-all duration-200 border
                        ${formData.role === role
                                                ? "bg-[#0055FE] border-[#0055FE] text-white shadow-md shadow-blue-500/20"
                                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                            }
                      `}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Email Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">Email Address</label>
                            <input
                                type="email"
                                name="email"
                                required
                                value={formData.email}
                                onChange={handleInputChange}
                                className="w-full h-11 px-4 bg-white border border-slate-200 rounded-lg outline-none text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/10 transition-all duration-200"
                                placeholder="name@company.com"
                            />
                        </div>

                        {/* Password Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-600">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    required
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    className="w-full h-11 pl-4 pr-11 bg-white border border-slate-200 rounded-lg outline-none text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/10 transition-all duration-200"
                                    placeholder="Enter your password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        {/* Remember & Forgot Password */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div
                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${rememberMe ? "bg-[#0055FE] border-[#0055FE]" : "bg-white border-slate-300 group-hover:border-slate-400"}`}
                                    onClick={() => setRememberMe(!rememberMe)}
                                >
                                    {rememberMe && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <span className="text-sm text-slate-500 group-hover:text-slate-600">Remember me</span>
                            </label>

                            <Link to="/forgot-password" className="text-sm font-medium text-[#0055FE] hover:underline">
                                Forgot password?
                            </Link>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold rounded-lg shadow-lg shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                        >
                            {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                            {isLoading ? "Signing in..." : "Sign In"}
                        </button>

                    </form>

                    <p className="mt-8 text-center text-slate-500 text-sm">
                        Don't have an account? <Link to="/adminregister" className="text-[#0055FE] font-bold hover:underline">Join Now</Link>
                    </p>

                </div>
            </div>

            {/* Right Panel - Image Overlay */}
            <div className="hidden lg:flex w-1/2 relative bg-slate-900 overflow-hidden">
                {/* Background Image with Opacity */}
                <div className="absolute inset-0 bg-[url('/src/assets/hero-image-1.webp')] bg-cover bg-center opacity-60 mix-blend-overlay"></div>

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>

                {/* Content */}
                <div className="relative z-10 w-full h-full flex flex-col justify-end p-12 lg:p-20">
                    <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
                        Manage your restaurant <br /> like a pro.
                    </h2>
                    <p className="text-slate-300 text-lg max-w-md">
                        Access real-time analytics, manage staff, and streamline your operations from one central dashboard.
                    </p>
                </div>
            </div>

        </div>
    );
};

export default ScreenAdminLogin;
