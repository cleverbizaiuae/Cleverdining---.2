import { SubmitHandler, useForm } from "react-hook-form";
import { LabelInput, PickCompanyLogo } from "../../components/input";
import { useNavigate } from "react-router";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { useState } from "react";
import { ImSpinner6 } from "react-icons/im";
import mobileLogo from "../../assets/mobile_logo.png";

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
  const { register, handleSubmit, watch, setValue } = useForm<Inputs>();
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    setLoading(true);
    console.log("Data sent :", data);

    try {
      const formData = new FormData();
      formData.append("email", data.email);
      formData.append("password", data.password);
      formData.append("username", data.customer_name);
      formData.append("resturent_name", data.restaurant_name);
      formData.append("location", data.location);
      formData.append("phone_number", data.phone_number);

      // Add image file if exists
      if (data.company_logo && data.company_logo[0]) {
        formData.append("image", data.company_logo[0]);
      }
      console.log(formData);
      const res = await axiosInstance.post("/owners/register/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log(res.data);

      const response = await axiosInstance.post("/login/", {
        email: data.email,
        password: data.password,
      });

      const { access, refresh, user } = response.data;

      // Store tokens if needed
      localStorage.setItem("accessToken", access);
      localStorage.setItem("refreshToken", refresh);
      localStorage.setItem("userInfo", JSON.stringify(user));

      // Redirect based on role
      switch (user.role) {
        case "chef":
          navigate("/chef");
          break;
        case "staff":
          navigate("/staff");
          break;
        case "owner":
          navigate("/restaurant");
          break;
        case "admin":
          navigate("/admin");
          break;
        default:
          navigate("/");
          break;
      }
      setLoading(false);
      toast.success("Registration successful!");
    } catch (error) {
      console.error("Registration failed:");
      if (error.status === 400) {
        console.log(error);
        toast.error(error?.response?.data?.email[0]);
      }
      setLoading(false);
      toast.error(
        error.response?.data?.phone_number[0] ||
        error.response?.data?.email[0] ||
        "Registration failed. Please try again.",
      );
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
          inputType="number"
          inputProps={{
            id: "phone_number",
            className:
              "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]",
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
