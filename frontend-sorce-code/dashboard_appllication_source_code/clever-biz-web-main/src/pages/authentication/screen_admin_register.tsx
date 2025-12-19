import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Store, MapPin, Upload, Phone as PhoneIcon, Lock, Loader2, User, Eye, EyeOff, CheckCircle } from "lucide-react";
import logo from "../../assets/cleverbiz_full_logo.png";
import registerBg from "../../assets/register-bg.jpg";
import toast from "react-hot-toast";

const ScreenAdminRegister = () => {
    const navigate = useNavigate();
    const [isVerified, setIsVerified] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Gate State
    const [accessCode, setAccessCode] = useState("");

    // Registration State
    const [formData, setFormData] = useState({
        customerName: "",
        restaurantName: "",
        location: "",
        phoneNumber: "",
        numberOfTables: 10,
        paymentProcessor: "",
        logo: null as File | null,
        email: "",
        password: "",
        // confirmPassword: "", // Spec implies single, logic can be simple
    });

    // Access Code Logic
    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (!/^\d*$/.test(value)) return;
        if (value.length > 4) return;
        setAccessCode(value);
    };

    const verifyCode = () => {
        if (accessCode === "2468") {
            setIsVerified(true);
        } else {
            toast.error("Invalid access code. Please try again.");
            // Don't clear code per spec ("Input remains populated")
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulated Network Request
        setTimeout(() => {
            setIsLoading(false);
            // navigate("/admindashboard");
            // The prompt says "Redirect to /admindashboard regardless of what data they entered"
            // But usually admin dashboard requires login.
            // Since this is a "Simulated" demo flow, maybe directly to dashboard is intended?
            // "The user is automatically redirected to /admindashboard"
            // I will follow the instruction.

            // Note: In a real app, we'd log them in. 
            // Since we can't create a real session without backend, we might hit a 401 on the dashboard if it checks auth.
            // But I must follow the spec.
            navigate("/admindashboard");
            toast.success("Account created successfully (Simulated)");
        }, 1500);
    };

    // --- RENDER STEPS ---

    const renderGate = () => (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50 font-inter">
            <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] p-8 text-center animate-fadeIn">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <img
                        src={logo}
                        alt="CleverBiz"
                        className="h-10 w-auto object-contain cursor-pointer hover:opacity-80 transition-opacity duration-200"
                        onClick={() => navigate('/')}
                    />
                </div>

                {/* Lock Icon */}
                <div className="w-16 h-16 rounded-full bg-[#0055FE]/10 flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-8 h-8 text-[#0055FE]" />
                </div>

                {/* Heading */}
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-3">Access Required</h1>
                <p className="text-sm text-slate-500 font-normal">Enter the access code to register a new account.</p>

                {/* Input */}
                <div className="mt-8 mb-4 text-left">
                    <label className="block text-sm font-medium text-slate-900 mb-2">Access Code</label>
                    <input
                        type="password"
                        value={accessCode}
                        onChange={handleCodeChange}
                        maxLength={4}
                        className="w-full h-12 bg-slate-50 border border-slate-200 rounded-lg px-3 text-lg text-center tracking-[0.25em] text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                        placeholder="Enter 4-digit code"
                    />
                </div>

                {/* Verify Button */}
                <button
                    onClick={verifyCode}
                    className="w-full h-12 mt-4 bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold rounded-lg shadow-[0_10px_15px_rgba(0,85,254,0.2)] transition-all flex items-center justify-center"
                >
                    Verify Access
                </button>

                {/* Back Link */}
                <div className="mt-6">
                    <button
                        onClick={() => navigate('/')}
                        className="text-sm font-medium text-[#0055FE] hover:underline"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        </div>
    );

    const renderForm = () => (
        <div className="w-full max-w-md mx-auto py-8">
            <div className="text-center mb-6">
                <img
                    src={logo}
                    alt="CleverBiz"
                    className="h-10 mx-auto mb-6 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => navigate('/')}
                />
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Enter your information</h1>
                <p className="text-base text-slate-500">Create your admin account to get started.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Customer Name */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Customer Name</label>
                    <input
                        type="text"
                        name="customerName"
                        required
                        value={formData.customerName}
                        onChange={handleInputChange}
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/20 outline-none transition-all"
                        placeholder="Kawsar Hossain"
                    />
                </div>

                {/* Restaurant Name */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Restaurant Name</label>
                    <input
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

                {/* Phone Number */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-900">Phone Number</label>
                    <input
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
                                <option value="Stripe">Stripe</option>
                                <option value="PayTabs">PayTabs</option>
                                <option value="Checkout.com">Checkout.com</option>
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

                {/* Sign Up Button */}
                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 mt-2 bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold rounded-lg shadow-[0_10px_15px_rgba(0,85,254,0.2)] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all text-lg"
                >
                    {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : null}
                    {!isLoading && "Sign Up"}
                </button>

                {/* Login Link */}
                <div className="text-center pt-2 pb-6">
                    <span className="text-slate-500 text-sm">Already have an account? </span>
                    <Link to="/adminlogin" className="text-[#0055FE] font-bold text-sm hover:underline">
                        Login
                    </Link>
                </div>
            </form>
        </div>
    );

    if (!isVerified) {
        return renderGate();
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
                        Join thousands of restaurants.
                    </h2>
                    <p className="text-white/80 text-lg">
                        Start your journey with the most advanced restaurant management OS.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ScreenAdminRegister;
