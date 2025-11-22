/* eslint-disable @typescript-eslint/no-explicit-any */
import { cn } from "clsx-for-tailwind";
import { Circle, Lock, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ImSpinner6 } from "react-icons/im";
import { Link, useNavigate } from "react-router";
import chef from "../assets/chef.png";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  TwitterIcon,
} from "../components/icons";
import { Logo } from "../components/icons/logo";
import axiosInstance from "../lib/axios";

const contactInfo = [
  {
    name: "Facebook",
    icon: FacebookIcon,
    url: "https://www.facebook.com/",
  },
  {
    name: "Instagram",
    icon: InstagramIcon,
    url: "https://www.instagram.com/",
  },
  {
    name: "Twitter",
    icon: TwitterIcon,
    url: "https://twitter.com/",
  },
  {
    name: "Linkedin",
    icon: LinkedinIcon,
    url: "https://www.linkedin.com/",
  },
];

const ScreenLogin = () => {
  const [loading, setLoading] = useState(false);
  const [tableNo, setTableNo] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const isAuthenticated = localStorage.getItem("accessToken");

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.post("/login/", {
        email: tableNo,
        password: password,
      });
      // Assuming response.data contains access and refresh tokens

      const { access, refresh, ...userInfo } = response.data;
      if (access && refresh) {
        localStorage.setItem("accessToken", access);
        localStorage.setItem("refreshToken", refresh);
        localStorage.setItem("userInfo", JSON.stringify(userInfo));
        toast.success(`Welcome! You are logged in.`);
        navigate("/dashboard");
      } else {
        toast.error("Invalid login response.");
      }
    } catch (error: any) {
      toast.error("Login failed. Please check your credentials.");
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full bg-background relative">
      {/* Bottom image and other */}
      <div className="absolute top-0 left-0 right-0 bottom-0 flex flex-row">
        <div className="basis-[55%] login-bg h-full z-0 relative hidden sm:block">
          <div className="absolute left-4 top-4">
            <img src={chef} alt="Chef" />
          </div>
          <div className="absolute bottom-4 w-full">
            <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 ">
              <p className="text-primary-text text-2xl text-center mb-4 font-medium">
                FOLLOW US ON
              </p>
              <div className="flex flex-row gap-x-8 items-center mb-8">
                {contactInfo.map((item) => (
                  <Link
                    key={item.name}
                    to={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={item.name}
                  >
                    <item.icon />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="basis-[100%] sm:basis-[45%] flex flex-col items-center justify-between rounded-l-xl z-5 p-6">
          <div className="mt-8">
            <Logo className="h-[60px] w-[290px]" />
          </div>

          {/* Input container */}
          <div className="w-1/2">
            {/* Login Page */}
            <h1 className="text-2xl text-start font-bold text-primary mt-4">
              Hello Again!
            </h1>
            <p className="text-start text-primary">Welcome back</p>
            <div className="space-y-4 mt-6">
              {/* Text Input Field */}
              <InputField
                icon={Circle}
                placeholder="Table No."
                value={tableNo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTableNo(e.target.value)
                }
              />
              {/* Password Input Field */}
              <InputField
                icon={Lock}
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
              />
            </div>

            <div className="flex flex-row justify-center items-center">
              <button
                type="button"
                className="w-full h-12 px-8 text-white bg-[#0575E6] focus:outline-none font-medium rounded-full text-sm mb-4 mt-4"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex gap-3 items-center justify-center">
                    <ImSpinner6 className="animate-spin" /> Loading...
                  </span>
                ) : (
                  "Login"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const InputField: React.FC<
  React.ComponentProps<"div"> &
    React.ComponentProps<"input"> & {
      icon: LucideIcon;
    }
> = ({ className, placeholder, type, icon: LucidIcon, ...props }) => {
  return (
    <div className={cn(className, "relative")} {...props}>
      <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
        {<LucidIcon className="text-primary/40" />}
      </div>
      <input
        type={type}
        className="block w-full p-4 ps-10 text-sm text-gray-900 border border-gray-300 rounded-full bg-background focus:outline-none"
        placeholder={placeholder}
      />
    </div>
  );
};

export default ScreenLogin;
