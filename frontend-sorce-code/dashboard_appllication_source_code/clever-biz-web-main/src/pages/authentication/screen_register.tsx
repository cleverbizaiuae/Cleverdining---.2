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
    console.log("FORM SUBMITTED - Raw data object:", data);
    console.log("Data type:", typeof data);
    console.log("Data keys:", Object.keys(data));
    console.log("Data is empty?", !data || Object.keys(data).length === 0);

    setLoading(true);

    // TEMPORARY: Test with hardcoded data to verify backend works
    const testData = {
      email: "test@example.com",
      password: "testpass123",
      customer_name: "Test User",
      restaurant_name: "Test Restaurant",
      location: "Test Location",
      phone_number: "+1234567890"
    };

    console.log("Using test data:", testData);

    try {
      const formData = new FormData();
      formData.append("email", testData.email);
      formData.append("password", testData.password);
      formData.append("username", testData.customer_name);
      formData.append("resturent_name", testData.restaurant_name);
      formData.append("location", testData.location);
      formData.append("phone_number", testData.phone_number);
      formData.append("package", "Basic");

      console.log("TEST FormData created with hardcoded data");

      const res = await axiosInstance.post("/owners/register/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("TEST SUCCESS:", res.data);
      toast.success("Test registration successful!");
      setLoading(false);
      return;
    } catch (error) {
      console.error("TEST FAILED:", error);
      toast.error("Test failed - backend issue");
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("email", data.email.trim());
      formData.append("password", data.password);
      formData.append("username", data.customer_name.trim());
      formData.append("resturent_name", data.restaurant_name.trim());
      formData.append("location", data.location.trim());
      formData.append("phone_number", (data.phone_number || "").trim());
      formData.append("package", "Basic"); // Default package

      // Add image file if exists (backend expects both 'image' and 'logo')
      if (data.company_logo && data.company_logo[0]) {
        formData.append("image", data.company_logo[0]);
        formData.append("logo", data.company_logo[0]); // Use same image for logo
      }

      // Debug FormData contents
      console.log("FormData entries:");
      for (let [key, value] of formData.entries()) {
        console.log(`  ${key}:`, typeof value === 'string' ? value : `${value.name} (${value.size} bytes)`);
      }

      console.log("Sending registration data:", {
        email: data.email,
        username: data.customer_name,
        restaurant_name: data.restaurant_name,
      });

      const res = await axiosInstance.post("/owners/register/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("Registration response:", res.data);

      // Auto-login after registration
      const response = await axiosInstance.post("/login/", {
        email: data.email.trim(),
        password: data.password,
      });

      const { access, refresh, user } = response.data;

      updateUserData(user, access, refresh);
      redirectToRoleDashboard(user.role);
      setLoading(false);
      toast.success("Registration successful!");
    } catch (error: any) {
      setLoading(false);
      console.error("Registration failed:", error);
      console.error("Error response:", error.response);
      console.error("Error response status:", error.response?.status);
      console.error("Error response data:", error.response?.data);
      console.error("Error response headers:", error.response?.headers);
      console.error("Full error object:", JSON.stringify(error, null, 2));
      
      // Show specific error messages
      if (error.response?.status === 400) {
        const errors = error.response.data || {};
        const errorMessages = [];
        
        if (errors.email) {
          errorMessages.push(Array.isArray(errors.email) ? errors.email[0] : errors.email);
        }
        if (errors.phone_number) {
          errorMessages.push(Array.isArray(errors.phone_number) ? errors.phone_number[0] : errors.phone_number);
        }
        if (errors.resturent_name) {
          errorMessages.push(Array.isArray(errors.resturent_name) ? errors.resturent_name[0] : errors.resturent_name);
        }
        if (errors.non_field_errors) {
          errorMessages.push(Array.isArray(errors.non_field_errors) ? errors.non_field_errors[0] : errors.non_field_errors);
        }
        
        toast.error(errorMessages.join(", ") || "Please check your input fields");
      } else if (error.response?.status === 500) {
        // Try to extract error message from response
        const errorData = error.response?.data || {};
        const errorMsg = errorData.detail || errorData.message || errorData.error || "Server error. Please try again later.";
        console.error("500 Error details:", errorMsg);
        toast.error(`Server error: ${errorMsg}`);
      } else if (error.message) {
        toast.error(`Error: ${error.message}`);
      } else {
        toast.error("Registration failed. Please try again.");
      }
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
            ...register("restaurant_name"),
          }}
        />
        <LabelInput
          label="Location"
          inputProps={{
            id: "location",
            ...register("location"),
          }}
        />

        <LabelInput
          label="Phone Number"
          inputType="tel"
          inputProps={{
            id: "phone_number",
            name: "phone_number",
            autoComplete: "tel",
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
            ...register("email"),
          }}
        />
        <LabelInput
          label="Password"
          inputType="password"
          inputProps={{
            id: "password",
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
