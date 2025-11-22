import { MdEmail } from "react-icons/md";
import { SubmitHandler, useForm } from "react-hook-form";
import { LabelInput } from "../../components/input";
import { useNavigate } from "react-router";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { useState } from "react";
import { ImSpinner6 } from "react-icons/im";

const ScreenEmailVerification = () => {
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  type Inputs = {
    email: string;
  };
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    try {
      const response = await axiosInstance.post("/send-otp/", {
        email: data.email,
      });

      // localStorage.setItem("verifyEmail", data.email);
      console.log("OTP sent successfully:", response.data);
      setLoading(false);
      toast.success(
        "OTP sent successfully to your email. Please check your inbox."
      );
      localStorage.setItem("verifyEmail", data.email);

      navigate("/verify-otp");
    } catch (error) {
      console.error("OTP sending failed:", error);
      alert("Failed to send OTP. Please try again.");
    }
  };

  return (
    <div className="bg-primary text-black p-8 rounded-xl shadow-lg w-full max-w-lg">
      <h2 className="text-xl mb-6 text-center text-primary-text">
        Email Verification
      </h2>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <LabelInput
          label="Email"
          inputProps={{
            id: "email",
            placeholder: "cleverbiz.user@gmail.com",
            ...register("email"),
          }}
          icon={<MdEmail />}
        />
        <p className="text-xs text-gray-500">
          We'll sent an temporary otp to your email.
        </p>
        <div className="text-center mt-12 mb-4">
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

export default ScreenEmailVerification;
