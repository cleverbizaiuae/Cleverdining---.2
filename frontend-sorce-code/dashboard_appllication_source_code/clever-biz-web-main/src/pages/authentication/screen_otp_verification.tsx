import { SubmitHandler, useForm } from "react-hook-form";
import { useRef, useState, useCallback, useEffect } from "react";
import { OtpTimer } from "../../components/utilities";
import { useNavigate } from "react-router";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { ImSpinner6 } from "react-icons/im";

const ScreenOtpVerification = () => {
  type Inputs = {
    otp: string;
  };
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, setValue } = useForm<Inputs>();
  const [digits, setDigits] = useState<string[]>(new Array(4).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Handle OTP submit

  const onSubmit: SubmitHandler<Inputs> = async () => {
    setLoading(true);
    const otp = digits.join("");
    setValue("otp", otp); // Sync with react-hook-form

    const email = localStorage.getItem("verifyEmail");

    if (!email) {
      alert("Email not found. Please verify your email again.");
      return;
    }

    try {
      const response = await axiosInstance.post("/verify-otp/", {
        email: email,
        otp: parseInt(otp),
      });

      toast.success("OTP verified successfully");
      setLoading(false);

      // Proceed to create-password page
      navigate("/create-password");
    } catch (error) {
      console.error("OTP verification failed:", error);
      alert("Invalid or expired OTP. Please try again.");
    }
  };
  // Ref setter (React 18 safe)
  const setInputRef = useCallback(
    (el: HTMLInputElement | null, index: number) => {
      inputRefs.current[index] = el;
    },
    []
  );

  // Handle value change
  const handleChange = (index: number, value: string) => {
    if (!/^[0-9]?$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    if (value && index < newDigits.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Backspace to previous input
  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const resentOTP = async () => {
    const email = localStorage.getItem("verifyEmail");
    if (!email) {
      alert("Email not found.");
      return;
    }

    try {
      await axiosInstance.post("/send-otp/", { email });
      alert("OTP resent successfully!");
    } catch (error) {
      console.error("Resend OTP failed:", error);
      alert("Failed to resend OTP.");
    }
  };

  // Optional: Sync digits to `otp` on every change
  useEffect(() => {
    setValue("otp", digits.join(""));
  }, [digits, setValue]);

  return (
    <div className="bg-primary text-primary-text p-8 rounded-xl shadow-lg w-full max-w-md">
      <h2 className="text-xl mb-1 text-center text-primary-text">
        OTP Verification
      </h2>
      <p className="text-xs text-primary-text/20 text-center mt-1">
        We have sent you OTP to your email
      </p>
      <div className="h-12" />
      <p className="text-sm text-primary-text/80 text-center mt-1">
        Enter Verification Code
      </p>
      <div className="h-4" />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex justify-center gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => setInputRef(el, index)}
              value={digit}
              maxLength={1}
              placeholder=""
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-12 h-14 text-center border-none rounded text-lg bg-input text-primary-text focus:outline-none focus:ring-2 focus:ring-accent"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          ))}
        </div>
        <div className="h-12" />
        <OtpTimer onResend={() => resentOTP()} />
        <div className="h-4" />
        <div className="text-center mb-4">
          <button type="submit" className="button-primary w-2/3">
            {loading ? (
              <span className="flex gap-3 items-center justify-center">
                <ImSpinner6 className="animate-spin" /> Loading...
              </span>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ScreenOtpVerification;
