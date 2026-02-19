import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { Loader2, ArrowLeft, Eye, EyeOff, CheckCircle2, ShieldCheck, AlertTriangle } from "lucide-react";
import axiosInstance from "../../lib/axios";
import logo from "../../assets/cleverbiz_full_logo.png";

// Password strength rules
const RULES = [
    { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
    { label: "1 uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
    { label: "1 number", test: (p: string) => /\d/.test(p) },
    { label: "1 special character", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
];

const ScreenResetPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") || "";

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // Redirect to login if no token
    useEffect(() => {
        if (!token) {
            navigate("/admin-login", { replace: true });
        }
    }, [token, navigate]);

    // Auto-redirect after success
    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => navigate("/admin-login", { replace: true }), 3000);
            return () => clearTimeout(timer);
        }
    }, [success, navigate]);

    const allRulesPassed = RULES.every((r) => r.test(password));
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!allRulesPassed) {
            setError("Password does not meet all requirements");
            return;
        }
        if (!passwordsMatch) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            await axiosInstance.post("/reset-password-token/", {
                token,
                new_password: password,
                confirm_password: confirmPassword,
            });
            setSuccess(true);
        } catch (err: any) {
            const msg = err.response?.data?.detail || "Failed to reset password. Please try again.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    if (!token) return null;

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-inter">
            <div
                className="w-full max-w-[420px] bg-white rounded-2xl shadow-lg border border-slate-100 p-8 sm:p-10"
                style={{ animation: "fadeIn 0.4s ease-out" }}
            >
                {/* Logo */}
                <div className="flex justify-center mb-8">
                    <img src={logo} alt="CleverDining" className="h-10 w-auto" />
                </div>

                {!success ? (
                    <>
                        {/* Header */}
                        <div className="text-center mb-8">
                            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <ShieldCheck className="text-[#0055FE]" size={24} />
                            </div>
                            <h1 className="text-xl font-bold text-slate-900 mb-1">Reset your password</h1>
                            <p className="text-sm text-slate-500">Choose a strong new password for your account.</p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* New Password */}
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1.5">New Password</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter new password"
                                        className="w-full h-11 pl-3 pr-10 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/10 transition-all"
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setError(""); }}
                                        autoFocus
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

                            {/* Password Strength */}
                            {password.length > 0 && (
                                <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                                    {RULES.map((rule, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={`w-4 h-4 rounded-full flex items-center justify-center ${rule.test(password) ? "bg-green-100" : "bg-slate-200"
                                                }`}>
                                                {rule.test(password) ? (
                                                    <CheckCircle2 size={12} className="text-green-600" />
                                                ) : (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                )}
                                            </div>
                                            <span className={`text-xs ${rule.test(password) ? "text-green-700" : "text-slate-500"}`}>
                                                {rule.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Confirm Password */}
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm Password</label>
                                <div className="relative">
                                    <input
                                        type={showConfirm ? "text" : "password"}
                                        placeholder="Re-enter new password"
                                        className={`w-full h-11 pl-3 pr-10 border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all ${confirmPassword.length > 0 && !passwordsMatch
                                                ? "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-100"
                                                : "border-slate-200 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/10"
                                            }`}
                                        value={confirmPassword}
                                        onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {confirmPassword.length > 0 && !passwordsMatch && (
                                    <p className="text-xs text-red-500 mt-1.5">Passwords do not match</p>
                                )}
                            </div>

                            {/* Error message */}
                            {error && (
                                <div className="flex items-center gap-2 bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-100">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading || !allRulesPassed || !passwordsMatch}
                                className="w-full h-11 bg-[#0055FE] hover:bg-[#0047D1] text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : "Reset Password"}
                            </button>
                        </form>
                    </>
                ) : (
                    /* Success State */
                    <div className="text-center py-4">
                        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5" style={{ animation: "scaleIn 0.4s ease-out" }}>
                            <CheckCircle2 className="text-green-500" size={32} />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 mb-2">Password updated!</h2>
                        <p className="text-sm text-slate-500 leading-relaxed mb-4">
                            Your password has been successfully reset.
                        </p>
                        <p className="text-xs text-slate-400">Redirecting to login in 3 seconds...</p>
                    </div>
                )}

                {/* Back to Login */}
                {!success && (
                    <div className="mt-6 text-center">
                        <Link
                            to="/admin-login"
                            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0055FE] transition-colors"
                        >
                            <ArrowLeft size={14} />
                            Back to Login
                        </Link>
                    </div>
                )}
            </div>

            {/* Animations */}
            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
      `}</style>
        </div>
    );
};

export default ScreenResetPassword;
