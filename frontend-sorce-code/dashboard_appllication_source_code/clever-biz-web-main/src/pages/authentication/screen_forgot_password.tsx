import { useState } from "react";
import { Link } from "react-router";
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import axiosInstance from "../../lib/axios";
import logo from "../../assets/cleverbiz_full_logo.png";

const ScreenForgotPassword = () => {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!email.trim()) {
            setError("Email is required");
            return;
        }
        if (!validateEmail(email)) {
            setError("Please enter a valid email address");
            return;
        }

        setLoading(true);
        try {
            await axiosInstance.post("/forgot-password/", { email });
            setSent(true);
        } catch (err: any) {
            // Backend always returns 200 for valid emails, so errors are network/validation issues
            const msg = err.response?.data?.detail || "Something went wrong. Please try again.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

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

                {!sent ? (
                    <>
                        {/* Header */}
                        <div className="text-center mb-8">
                            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Mail className="text-[#0055FE]" size={24} />
                            </div>
                            <h1 className="text-xl font-bold text-slate-900 mb-1">Forgot your password?</h1>
                            <p className="text-sm text-slate-500">Enter your registered email to receive a reset link.</p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1.5">Email Address</label>
                                <input
                                    type="email"
                                    placeholder="name@company.com"
                                    className={`w-full h-11 px-3 border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all ${error
                                            ? "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-100"
                                            : "border-slate-200 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/10"
                                        }`}
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                                    autoFocus
                                />
                                {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full h-11 bg-[#0055FE] hover:bg-[#0047D1] text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : "Send Reset Link"}
                            </button>
                        </form>
                    </>
                ) : (
                    /* Success State */
                    <div className="text-center py-4">
                        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
                            <CheckCircle2 className="text-green-500" size={32} />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 mb-2">Check your email</h2>
                        <p className="text-sm text-slate-500 leading-relaxed mb-6">
                            If the email is registered, you will receive a password reset link shortly.
                        </p>
                        <p className="text-xs text-slate-400 mb-6">
                            Didn't receive it? Check your spam folder or{" "}
                            <button
                                onClick={() => { setSent(false); setEmail(""); }}
                                className="text-[#0055FE] hover:underline font-medium"
                            >
                                try again
                            </button>
                        </p>
                    </div>
                )}

                {/* Back to Login */}
                <div className="mt-6 text-center">
                    <Link
                        to="/admin-login"
                        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0055FE] transition-colors"
                    >
                        <ArrowLeft size={14} />
                        Back to Login
                    </Link>
                </div>
            </div>

            {/* Fade-in animation */}
            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
};

export default ScreenForgotPassword;
