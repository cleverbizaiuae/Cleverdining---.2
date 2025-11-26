import { SubmitHandler, useForm } from "react-hook-form";
import { LabelInput, PickCompanyLogo } from "../../components/input";
import { useNavigate } from "react-router";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { useCallback, useEffect, useState } from "react";
import { ImSpinner6 } from "react-icons/im";
import mobileLogo from "../../assets/mobile_logo.png";
import { useRole, UserRole } from "../../hooks/useRole";

const ScreenRegister = () => {
  const [loading, setLoading] = useState(false);
  type Inputs = {
    customer_name: string;
    restaurant_name: string;
    location: string;
    phone_number: string;
    company_logo: FileList | undefined;
    email: string;
    password: string;
  };
  const navigate = useNavigate();
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
  const { register, handleSubmit, watch, setValue } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    console.log("FORM SUBMITTED:", data);
    
    // Validation
    if (!data.email || !data.password || !data.customer_name || 
        !data.restaurant_name || !data.location) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (data.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Register owner
      const formData = new FormData();
      formData.append("email", data.email.trim());
      formData.append("password", data.password);
      formData.append("username", data.customer_name.trim());
      formData.append("resturent_name", data.restaurant_name.trim());
      formData.append("location", data.location.trim());
      formData.append("phone_number", (data.phone_number || "").trim());
      formData.append("package", "Basic");

      // Add logo if provided
      if (data.company_logo && data.company_logo[0]) {
        formData.append("image", data.company_logo[0]);
        formData.append("logo", data.company_logo[0]);
      }

      console.log("Registering owner...");
      await axiosInstance.post("/owners/register/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      console.log("Registration successful, logging in...");
      toast.success("Registration successful! Logging you in...");

      // Step 2: Auto-login
      const loginResponse = await axiosInstance.post("/login/", {
        email: data.email.trim(),
        password: data.password,
      });

      const { access, refresh, user } = loginResponse.data;

      // Step 3: Save tokens and redirect
      updateUserData(user, access, refresh);
      toast.success(`Welcome! You are logged in as ${user.role}`);
      redirectToRoleDashboard(user.role);

    } catch (error: any) {
      console.error("Error:", error);
      console.error("Error response:", error.response);
      
      if (error.response?.status === 400) {
        const errors = error.response.data || {};
        const msgs = [];
        
        if (errors.email) msgs.push(Array.isArray(errors.email) ? errors.email[0] : errors.email);
        if (errors.phone_number) msgs.push(Array.isArray(errors.phone_number) ? errors.phone_number[0] : errors.phone_number);
        if (errors.resturent_name) msgs.push(Array.isArray(errors.resturent_name) ? errors.resturent_name[0] : errors.resturent_name);
        if (errors.detail) msgs.push(Array.isArray(errors.detail) ? errors.detail[0] : errors.detail);
        
        toast.error(msgs.join(", ") || "Please check your input");
        
      } else if (error.response?.status === 500) {
        const errorMsg = error.response?.data?.detail || error.response?.data?.message || "Server error";
        console.error("500 Error details:", errorMsg);
        toast.error(`Server error: ${errorMsg}`);
      } else {
        toast.error(error.message || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const logoFile: File | undefined = watch("company_logo")?.[0];
  return (
    <div className="bg-primary text-black p-8 rounded-xl shadow-lg w-full max-w-xl">
      <h2 className="text-3xl mb-6 text-center text-primary-text">
        Enter your information
      </h2>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <LabelInput
          label="Customer Name"
          inputProps={{
            id: "customer_name",
            placeholder: "Kawsar Hossain",
            ...register("customer_name"),
          }}
        />

        <LabelInput
          label="Restaurant Name"
          inputProps={{
            id: "restaurant_name",
            placeholder: "Restaurant Name",
            ...register("restaurant_name"),
          }}
        />

        <LabelInput
          label="Location"
          inputProps={{
            id: "location",
            placeholder: "City, Country",
            ...register("location"),
          }}
        />

        <LabelInput
          label="Phone Number"
          inputType="tel"
          inputProps={{
            id: "phone_number",
            placeholder: "+1234567890",
            ...register("phone_number"),
          }}
        />
        {/* <LabelInput
          label="Package"
          inputProps={{
            id: "package",
            ...register("package"),
          }}
        /> */}
        <div className="flex flex-col items-center gap-4 mb-4">
          <img src={mobileLogo} alt="Default Logo" className="w-24 h-24 object-contain" />
          <p className="text-sm text-gray-400">Default Mobile App Logo</p>
        </div>
        <PickCompanyLogo
          file={logoFile}
          label="Upload Custom Logo (Optional)"
          inputProps={{
            id: "company_logo",
            ...register("company_logo"),
          }}
          removeFile={() => setValue("company_logo", undefined)}
        />
        <LabelInput
          label="Email"
          inputType="email"
          inputProps={{
            id: "email",
            placeholder: "your@email.com",
            ...register("email"),
          }}
        />

        <LabelInput
          label="Password"
          inputType="password"
          inputProps={{
            id: "password",
            placeholder: "Minimum 6 characters",
            ...register("password"),
          }}
        />
        <div className="text-center mt-14 mb-6">
          <button type="submit" className="button-primary px-14">
            {loading ? (
              <span className="flex gap-3 items-center justify-center">
                <ImSpinner6 className="animate-spin" /> Loading...
              </span>
            ) : (
              "Sign Up"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ScreenRegister;
