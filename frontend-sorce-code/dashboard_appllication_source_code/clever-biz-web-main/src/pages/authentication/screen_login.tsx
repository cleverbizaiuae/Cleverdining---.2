import { Checkbox, Field, Label } from "@headlessui/react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { HiLockClosed } from "react-icons/hi";
import { MdEmail } from "react-icons/md";
import { Link, useNavigate } from "react-router";
import { LabelInput } from "../../components/input";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { useCallback, useEffect, useState } from "react";
import { ImSpinner6 } from "react-icons/im";
import { useRole, UserRole } from "../../hooks/useRole";

const ScreenLogin = () => {
  type Inputs = {
    email: string;
    password: string;
    remember: boolean;
  };
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { updateUserData, userInfo, isLoading, getDashboardPath } = useRole();
  const redirectToRoleDashboard = useCallback(
    (role?: UserRole | null) => {
      const destination = getDashboardPath(role);
      navigate(destination, { replace: true });
    },
    [getDashboardPath, navigate]
  );

  useEffect(() => {
    if (!isLoading && userInfo?.role) {
      redirectToRoleDashboard(userInfo.role);
    }
  }, [isLoading, userInfo, redirectToRoleDashboard]);

  const { register, handleSubmit, control } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    try {
      const response = await axiosInstance.post("/login/", {
        email: data.email,
        password: data.password,
      });

      const { access, refresh, user } = response.data;

      // Use the hook to update user data
      updateUserData(user, access, refresh);
      setLoading(false);
      
      // Show success message with role info
      toast.success(`Welcome! You are logged in as ${user.role}`);
     

      redirectToRoleDashboard(user.role);
    } catch (error: any) {
      setLoading(false);
      console.error("Login failed:", error);

      // Show more specific error messages
      if (error.response?.status === 401) {
        toast.error("Invalid email or password");
      } else if (error.response?.status === 400) {
        toast.error("Please check your input fields");
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Login failed. Please try again.");
      }
    }
  };

  return (
    <div className="bg-primary text-black p-8 rounded-xl shadow-lg w-full max-w-lg">
      <h2 className="text-3xl mb-6 text-center text-primary-text">Welcome</h2>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <LabelInput
          label="Email"
          inputProps={{
            id: "email",
            ...register("email"),
          }}
          icon={<MdEmail />}
        />
        <LabelInput
          label="Password"
          inputProps={{
            id: "password",
            ...register("password"),
          }}
          icon={<HiLockClosed className="h-4 w-4" />}
          inputType="password"
        />
        <div className="flex justify-between items-center">
          <Controller
            control={control}
            name="remember"
            render={({ field }) => (
              <Field className="flex items-center gap-2">
                <Checkbox
                  checked={field.value}
                  onChange={field.onChange}
                  className="group block size-4 rounded border bg-white data-[checked]:bg-blue-500"
                >
                  <svg
                    className="stroke-white opacity-0 group-data-[checked]:opacity-100"
                    viewBox="0 0 14 14"
                    fill="none"
                  >
                    <path
                      d="M3 8L6 11L11 3.5"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Checkbox>
                <Label className="text-sm text-primary-text">Remember Me</Label>
              </Field>
            )}
          />

          <Link
            className="text-sm text-primary-text border border-primary-text/20 rounded-md p-1"
            to="/verify-email"
          >
            Forgot Password
          </Link>
        </div>
        <div className="text-center mt-8 mb-14">
          <button type="submit" className="button-primary px-14">
            {loading ? (
              <span className="flex gap-3 items-center justify-center">
                <ImSpinner6 className="animate-spin" /> Loading...
              </span>
            ) : (
              "Login"
            )}
          </button>
        </div>
        <div className="text-center flex justify-center items-center">
          <p className="text-sm text-primary-text/40">Don't have account?</p>
          <div className="w-2"></div>
          <Link
            className="text-sm text-primary-text border border-primary-text/20 rounded-md p-1"
            to="/register"
          >
            Register
          </Link>
        </div>
      </form>
    </div>
  );
};

export default ScreenLogin;
