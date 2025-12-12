import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";
import axiosInstance from "../../lib/axios";
import logo from "../../assets/mobile_logo.png";

const ScreenSuperAdminLogin = () => {
    const navigate = useNavigate();

    // State
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await axiosInstance.post("/login/", {
                email,
                password,
            });

            const { access, refresh, user } = response.data;

            // STRICT CHECK: Ensure user is actually authorized for Super Admin
            // Adjust this condition based on actual backend 'Super Admin' role string
            // For now, assuming 'admin' or 'super_admin' or specific email check if role is missing
            if (user.role !== 'admin' && user.role !== 'super_admin' && user.email !== 'admin@cleverbiz.ai') {
                setError("Access Denied: You do not have Super Admin privileges.");
                setLoading(false);
                return;
            }

            localStorage.setItem("superAdminToken", access);
            localStorage.setItem("superAdminAuth", "true");

            navigate("/superadmin");

        } catch (err: any) {
            console.error("Super Admin Login Error:", err);
            setError(err.response?.data?.detail || "Invalid email or password.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F172A] p-4 font-inter">
            {/* Header Section */}
            <div className="flex flex-col items-center mb-8">
                <img src={logo} alt="CleverBiz AI" className="h-10 mb-4" />
                <h1 className="text-2xl font-bold text-white">Super Admin</h1>
                <p className="text-sm text-slate-400 mt-1">Sign in to manage restaurants</p>
            </div>

            {/* Form Card */}
            <div className="w-full max-w-sm bg-[#1E293B] rounded-2xl border border-slate-700 p-6 shadow-xl">

                {/* Error Alert */}
                {error && (
                    <div className="mb-6 bg-red-500/20 border border-red-500/30 rounded-lg p-3 flex items-center justify-center gap-2 text-red-400 text-sm animate-fadeIn">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">

                    {/* Email Input */}
                    <div className="space-y-1.5">
                        <label className="block text-xs text-slate-400">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="email"
                                required
                                placeholder="admin@cleverbiz.ai"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-10 pl-10 pr-4 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 text-sm focus:border-[#0055FE] focus:ring-1 focus:ring-[#0055FE] outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Password Input */}
                    <div className="space-y-1.5">
                        <label className="block text-xs text-slate-400">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-10 pl-10 pr-10 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 text-sm focus:border-[#0055FE] focus:ring-1 focus:ring-[#0055FE] outline-none transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Sign In Button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-10 mt-2 bg-[#0055FE] hover:bg-[#0047D1] disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 className="animate-spin" size={16} />}
                        {loading ? "Signing in..." : "Sign In"}
                    </button>

                </form>
            </div>

            {/* Footer */}
            <p className="mt-8 text-xs text-slate-500 text-center">
                Powered by CleverBiz AI
            </p>
        </div>
    );
};

export default ScreenSuperAdminLogin;
