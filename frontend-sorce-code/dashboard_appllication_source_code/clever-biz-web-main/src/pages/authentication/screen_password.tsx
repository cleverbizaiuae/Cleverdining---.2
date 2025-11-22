import { SubmitHandler, useForm } from "react-hook-form";
import { HiLockClosed } from "react-icons/hi";
import { LabelInput } from "../../components/input";
import { useNavigate } from "react-router";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { useState } from "react";
import { ImSpinner6 } from "react-icons/im";

const ScreenPassword = () => {
  const [loading, setLoading] = useState(false);

  type Inputs = {
    password: string;
    confirm_password: string;
  };
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    const email = localStorage.getItem("verifyEmail");
    if (!email) {
      alert("Email not found. Please restart the process.");
      return;
    }

    try {
      const response = await axiosInstance.post(
        `/reset-password/?email=${email}`,
        {
          new_password: data.password,
          confirm_password: data.confirm_password,
        }
      );
      setLoading(false);
      console.log("Password reset successful:", response.data);
      toast.success("Password reset successful! Please login.");
      navigate("/login");
    } catch (error) {
      toast.error(error.response.data.new_password[0]);
    }
  };

  return (
    <div className="bg-primary text-black p-8 rounded-xl shadow-lg w-full max-w-md">
      <h2 className="text-3xl mb-6 text-center text-primary-text">
        Reset Password
      </h2>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <LabelInput
          label="Password"
          inputProps={{
            id: "password",
            ...register("password"),
          }}
          icon={<HiLockClosed className="h-4 w-4" />}
          inputType="password"
        />
        <LabelInput
          label="Confirm Password"
          inputProps={{
            id: "confirm_password",
            ...register("confirm_password"),
          }}
          icon={<HiLockClosed className="h-4 w-4" />}
          inputType="password"
        />

        <div className="text-center mt-16 mb-14">
          <button type="submit" className="button-primary w-2/3">
            {loading ? (
              <span className="flex gap-3 items-center justify-center">
                <ImSpinner6 className="animate-spin" /> Loading...
              </span>
            ) : (
              "Submit"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ScreenPassword;
