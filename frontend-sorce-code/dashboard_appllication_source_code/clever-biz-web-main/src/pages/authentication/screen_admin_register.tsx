import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Store, MapPin, Upload, Phone as PhoneIcon, Lock, Loader2, User, Eye, EyeOff, CheckCircle } from "lucide-react";
import logo from "../../assets/cleverbiz_full_logo.png";
import toast from "react-hot-toast";

const ScreenAdminRegister = () => {
    const navigate = useNavigate();
    const [isVerified, setIsVerified] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Gate State
    const [accessCode, setAccessCode] = useState(["", "", "", ""]);

    // Registration State
    const [formData, setFormData] = useState({
        customerName: "",
        restaurantName: "",
        location: "",
        phoneNumber: "",
        numberOfTables: 10,
        paymentProcessor: "Stripe",
        logo: null as File | null,
        email: "",
        password: "",
        // confirmPassword: "", // Spec implies single, logic can be simple
    });

    // Access Code Logic
    const handleCodeChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        if (value.length > 1) return;
        const newCode = [...accessCode];
        newCode[index] = value;
        setAccessCode(newCode);

        // Auto-focus next
        if (value && index < 3) {
            const nextInput = document.getElementById(`code-${index + 1}`);
            nextInput?.focus();
        }
    };

    const verifyCode = () => {
        const code = accessCode.join("");
        if (code === "2468") {
            // toast.success("Access Granted");
            setIsVerified(true);
        } else {
            toast.error("Invalid access code. Please try again.");
            setAccessCode(["", "", "", ""]);
            document.getElementById("code-0")?.focus();
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
        <div className="max-w-md w-full mx-auto text-center animate-fadeIn flex flex-col items-center">
            {/* Logo */}
            <img src={logo} alt="CleverBiz" className="h-8 mb-8 cursor-pointer" onClick={() => navigate('/')} />

            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 w-full">
                <div className="bg-[#0055FE]/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Lock className="w-8 h-8 text-[#0055FE]" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h1>
                <p className="text-slate-500 mb-8 text-sm">Enter the access code to register a new account.</p>

                <div className="mb-2 text-left w-full">
                    <label className="text-xs font-semibold text-slate-900 ml-1">Access Code</label>
                </div>
                <div className="flex gap-3 justify-center mb-6">
                    {accessCode.map((digit, idx) => (
                        <input
                            key={idx}
                            id={`code-${idx}`}
                            type="password" // "masked for security" per spec
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleCodeChange(idx, e.target.value)}
                            className="w-full h-12 text-center text-xl font-bold border border-slate-200 rounded-lg text-slate-900 focus:border-[#0055FE] focus:ring-4 focus:ring-[#0055FE]/10 outline-none transition-all placeholder:text-slate-200"
                            placeholder="•"
                        />
                    ))}
                </div>

                <button
                    onClick={verifyCode}
                    className="w-full h-11 bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold rounded-lg shadow-lg shadow-blue-500/20 transition-all text-sm"
                >
                    Verify Access
                </button>
            </div>

            <button onClick={() => navigate('/')} className="mt-8 text-slate-500 hover:text-[#0055FE] text-sm font-medium">
                Back to Home
            </button>
        </div>
    );

    const renderForm = () => (
        <div className="max-w-[480px] w-full mx-auto animate-fadeIn pb-12">
            <div className="text-center mb-8">
                <img src={logo} alt="CleverBiz" className="h-8 mx-auto mb-6 cursor-pointer" onClick={() => navigate('/')} />
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Enter your information</h1>
                <p className="text-slate-500">Create your admin account to get started.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Customer Name */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Customer Name</label>
                    <input
                        type="text"
                        name="customerName"
                        required
                        value={formData.customerName}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] outline-none bg-slate-50/50 focus:bg-white transition-colors"
                        placeholder="Kawsar Hossain"
                    />
                </div>

                {/* Restaurant Name */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Restaurant Name</label>
                    <input
                        type="text"
                        name="restaurantName"
                        required
                        value={formData.restaurantName}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] outline-none bg-slate-50/50 focus:bg-white transition-colors"
                        placeholder="Bistro 55"
                    />
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Location</label>
                    <input
                        type="text"
                        name="location"
                        required
                        value={formData.location}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] outline-none bg-slate-50/50 focus:bg-white transition-colors"
                        placeholder="City, Country"
                    />
                </div>

                {/* Phone Number */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Phone Number</label>
                    <input
                        type="tel"
                        name="phoneNumber"
                        required
                        value={formData.phoneNumber}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] outline-none bg-slate-50/50 focus:bg-white transition-colors"
                        placeholder="+1234567890"
                    />
                </div>

                {/* Tables & Payment */}
                <div className="flex gap-4">
                    <div className="space-y-1.5 flex-1">
                        <label className="text-sm font-medium text-slate-700">Number of Tables</label>
                        <input
                            type="number"
                            name="numberOfTables"
                            min="1"
                            max="500"
                            required
                            value={formData.numberOfTables}
                            onChange={handleInputChange}
                            className="w-full h-11 px-4 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] outline-none bg-slate-50/50 focus:bg-white transition-colors"
                        />
                    </div>
                    <div className="space-y-1.5 flex-1">
                        <label className="text-sm font-medium text-slate-700">Payment Processor</label>
                        <select
                            name="paymentProcessor"
                            value={formData.paymentProcessor}
                            onChange={handleInputChange}
                            className="w-full h-11 px-4 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] outline-none bg-slate-50/50 focus:bg-white transition-colors appearance-none"
                        >
                            <option value="Stripe">Stripe</option>
                            <option value="PayTabs">PayTabs</option>
                            <option value="Checkout.com">Checkout.com</option>
                        </select>
                    </div>
                </div>

                {/* Logo Upload */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Restaurant Logo (Optional)</label>
                    <div className="relative border-2 border-dashed border-slate-200 rounded-lg h-24 flex flex-col items-center justify-center hover:border-[#0055FE]/50 transition-colors bg-slate-50 hover:bg-white cursor-pointer group">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setFormData({ ...formData, logo: e.target.files?.[0] || null })}
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        />
                        <div className="group-hover:scale-110 transition-transform duration-200">
                            <Upload className="text-slate-400 group-hover:text-[#0055FE] mb-2 mx-auto" size={24} />
                        </div>
                        <span className="text-xs text-slate-500 font-medium">{formData.logo ? formData.logo.name : "Upload Custom Logo (Optional)"}</span>
                    </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Email</label>
                    <input
                        type="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full h-11 px-4 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] outline-none bg-slate-50/50 focus:bg-white transition-colors"
                        placeholder="your@email.com"
                    />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Password</label>
                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            name="password"
                            required
                            value={formData.password}
                            onChange={handleInputChange}
                            className="w-full h-11 pl-4 pr-10 border border-slate-200 rounded-lg text-sm focus:border-[#0055FE] outline-none bg-slate-50/50 focus:bg-white transition-colors"
                            placeholder="Minimum 6 characters"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 mt-4 bg-[#0055FE] hover:bg-[#0047D1] text-white font-semibold rounded-lg shadow-lg shadow-blue-500/20 disabled:opacity-70 flex items-center justify-center gap-2 transition-all text-sm"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : null}
                    {isLoading ? "Processing..." : "Sign Up"}
                </button>

                <div className="text-center pt-4">
                    <span className="text-slate-500 text-sm">Already have an account? </span>
                    <Link to="/adminlogin" className="text-[#0055FE] font-bold text-sm hover:underline">
                        Login
                    </Link>
                </div>
            </form>
        </div>
    );

    return (
        <div className="flex min-h-screen bg-white font-inter">
            {/* Left Panel */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 lg:px-16 py-8 relative overflow-y-auto">
                {!isVerified ? renderGate() : renderForm()}
            </div>

            {/* Right Panel */}
            <div className="hidden lg:flex w-1/2 relative bg-slate-900 overflow-hidden">
                <div className="absolute inset-0 bg-[url('/src/assets/hero-image-1.webp')] bg-cover bg-center opacity-80 mix-blend-overlay"></div>
                {/* Blue tint overlay */}
                <div className="absolute inset-0 bg-blue-900/30 mix-blend-multiply"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent"></div>

                <div className="relative z-10 w-full h-full flex flex-col justify-end p-20">
                    <h2 className="text-[40px] font-bold text-white mb-2 leading-tight">
                        Join thousands of restaurants.
                    </h2>
                    <p className="text-white/90 text-lg font-light">
                        Start your journey with the most advanced restaurant management OS.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ScreenAdminRegister;
