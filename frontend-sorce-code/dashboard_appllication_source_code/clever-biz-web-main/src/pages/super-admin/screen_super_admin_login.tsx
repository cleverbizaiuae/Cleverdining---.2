import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";
import axiosInstance from "../../lib/axios";
import logo from "../../assets/cleverbiz_full_logo.png"; // Updated Logo

const ScreenSuperAdminLogin = () => {
    const navigate = useNavigate();

    // State
    const [accessCode, setAccessCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        // 1. Check PIN
        if (accessCode !== "2468") {
            setError("Invalid Access Code");
            setLoading(false);
            return;
        }

        try {
            // 2. Perform background login to get real JWT
            // Using standard dev credentials associated with this PIN
            const response = await axiosInstance.post("/login/", {
                email: "admin@cleverbiz.ai",
                password: "password123",
            });

            const { access } = response.data;
            // Note: We skip strict role check here as '2468' is the master key for this user
            // But we could check response.data.user.role if needed.

            localStorage.setItem("superAdminToken", access);
            localStorage.setItem("superAdminAuth", "true");

            navigate("/superadmin");

        } catch (err: any) {
            console.error("Super Admin Login Error:", err);
            // If the actual backend auth fails (changed password?), fallback or show error
            setError("System Authentication Failed. Please verify admin credentials.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50 p-4 font-inter">
            {/* Card */}
            <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 text-center">

                {/* Logo & Header */}
                <div className="flex flex-col items-center mb-8">
                    <img src={logo} alt="CleverBiz AI" className="h-8 w-auto mb-6" />

                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-[#0055FE]">
                        <Lock size={24} strokeWidth={2.5} />
                    </div>

                    <h1 className="text-xl font-bold text-slate-900 mb-2">Access Required</h1>
                    <p className="text-sm text-slate-500 max-w-[260px]">
                        Enter the access code to manage the super admin dashboard.
                    </p>
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-3 flex items-center justify-center gap-2 text-red-600 text-xs font-medium animate-in fade-in slide-in-from-top-1">
                        <AlertCircle size={14} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2 text-left">
                        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider ml-1">Access Code</label>
                        <input
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            required
                            placeholder="Enter 4-digit code"
                            value={accessCode}
                            onChange={(e) => setAccessCode(e.target.value)}
                            className="w-full h-12 px-4 bg-white border border-slate-200 rounded-xl text-center text-lg tracking-[0.5em] font-bold text-slate-900 focus:border-[#0055FE] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-300 placeholder:tracking-normal placeholder:font-normal placeholder:text-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-[#0055FE] hover:bg-[#0047D1] disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : "Verify Access"}
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
                    >
                        Back to Home
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ScreenSuperAdminLogin;
