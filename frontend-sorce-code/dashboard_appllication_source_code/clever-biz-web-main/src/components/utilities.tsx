import { useEffect, useRef, useState } from "react";
import { FaRegCalendarCheck } from "react-icons/fa6";
import { GrFormNext, GrFormPrevious } from "react-icons/gr";
import { HiChevronRight } from "react-icons/hi2";
import {
  CurveSvg,
  IconArrowRight,
  IconBox,
  IconDelete,
  IconEdit,
  IconSend,
  IconStar,
} from "./icons";
import { ButtonStatus, TextSearchBoxCompact } from "./input";
import {
  DeleteFoodItemModal,
  EditFoodItemModal,
  ModalCall,
  ModalCallConfirm,
} from "./modals";
import { cn } from "clsx-for-tailwind";
import { IoCall } from "react-icons/io5";
import food from "../assets/food.webp";
import { Progress } from "./ui/progress";
import profile from "../assets/trailing-icon.png";
import { Link, useNavigate } from "react-router";
import toast from "react-hot-toast";
import axiosInstance from "@/lib/axios";
import { useOwner } from "@/context/ownerContext";
import { useStaff } from "@/context/staffContext";
import { useRole } from "@/hooks/useRole";
import CallerModal from "@/pages/model/CallerModal";
import { FoodItem } from "@/types";
/* Logo Component */
type LogoProps = {
  className?: string; // Optional className for styling wrapper div
};
export const Logo: React.FC<LogoProps> = ({ className }) => (
  <svg
    width="312"
    height="64"
    className={className}
    viewBox="0 0 312 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M54.5796 57.0625V11.207H63.6849V57.0625H54.5796Z" fill="#2962FF" />
    <path
      d="M86.3375 57.8055C82.8207 57.8055 79.7566 57.0113 77.1626 55.4404C74.5685 53.8695 72.5664 51.7338 71.1562 49.0686C69.746 46.4034 69.0322 43.4558 69.0322 40.2082C69.0322 36.837 69.7634 33.8541 71.2433 31.2242C72.7231 28.5943 74.7078 26.5292 77.2148 25.0113C79.7218 23.4933 82.5596 22.7344 85.7108 22.7344C88.3396 22.7344 90.6725 23.158 92.6921 23.9875C94.7116 24.8348 96.4178 26.0173 97.8279 27.5353C99.2207 29.0532 100.283 30.8006 101.014 32.795C101.745 34.7895 102.111 36.9429 102.111 39.2904C102.111 39.9434 102.076 40.5965 102.024 41.2319C101.971 41.8673 101.85 42.4145 101.693 42.8557H76.8666V36.078H96.5396L92.222 39.2727C92.6224 37.5077 92.605 35.9368 92.1698 34.5601C91.7171 33.1834 90.9511 32.1067 89.8369 31.2948C88.7226 30.5005 87.3647 30.0946 85.7456 30.0946C84.1613 30.0946 82.8033 30.4829 81.6717 31.2595C80.5401 32.0361 79.687 33.1834 79.1299 34.7013C78.5554 36.2192 78.3464 38.0725 78.4683 40.2435C78.3116 42.1321 78.5205 43.7912 79.1299 45.2209C79.7392 46.6505 80.6619 47.7802 81.9154 48.5744C83.1689 49.3687 84.6836 49.7746 86.4768 49.7746C88.0959 49.7746 89.4887 49.4393 90.6377 48.7862C91.7868 48.1332 92.6921 47.233 93.3362 46.0857L100.614 49.5981C99.9693 51.2396 98.9422 52.6693 97.5494 53.9048C96.1566 55.1403 94.5027 56.0934 92.605 56.7642C90.6725 57.4702 88.6008 57.8055 86.3375 57.8055Z"
      fill="#2962FF"
    />
    <path
      d="M117.22 57.0632L104.163 23.457H113.999L123.052 48.8735H119.292L128.345 23.457H138.181L125.124 57.0632H117.22Z"
      fill="#2962FF"
    />
    <path
      d="M157.543 57.8055C154.026 57.8055 150.962 57.0113 148.368 55.4404C145.774 53.8695 143.771 51.7338 142.361 49.0686C140.951 46.4034 140.237 43.4558 140.237 40.2082C140.237 36.837 140.969 33.8541 142.448 31.2242C143.928 28.5943 145.913 26.5292 148.42 25.0113C150.927 23.4933 153.765 22.7344 156.916 22.7344C159.545 22.7344 161.878 23.158 163.897 23.9875C165.917 24.8348 167.623 26.0173 169.033 27.5353C170.426 29.0532 171.488 30.8006 172.219 32.795C172.95 34.7895 173.316 36.9429 173.316 39.2904C173.316 39.9434 173.281 40.5965 173.229 41.2319C173.177 41.8673 173.055 42.4145 172.898 42.8557H148.072V36.078H167.745L163.427 39.2727C163.828 37.5077 163.81 35.9368 163.375 34.5601C162.922 33.1834 162.156 32.1067 161.042 31.2948C159.928 30.5005 158.57 30.0946 156.951 30.0946C155.366 30.0946 154.008 30.4829 152.877 31.2595C151.745 32.0361 150.892 33.1834 150.335 34.7013C149.76 36.2192 149.552 38.0725 149.673 40.2435C149.517 42.1321 149.726 43.7912 150.335 45.2209C150.944 46.6505 151.867 47.7802 153.121 48.5744C154.374 49.3687 155.889 49.7746 157.682 49.7746C159.301 49.7746 160.694 49.4393 161.843 48.7862C162.992 48.1332 163.897 47.233 164.541 46.0857L171.819 49.5981C171.174 51.2396 170.147 52.6693 168.754 53.9048C167.362 55.1403 165.708 56.0934 163.81 56.7642C161.895 57.4702 159.806 57.8055 157.543 57.8055Z"
      fill="#2962FF"
    />
    <path
      d="M178.659 57.0627V23.4565H187.155V31.5227L186.545 30.3578C187.277 27.5337 188.478 25.6099 190.149 24.6038C191.82 23.5977 193.823 23.1035 196.121 23.1035H198.071V31.0991H195.215C192.987 31.0991 191.194 31.7875 189.818 33.1642C188.443 34.5409 187.747 36.4824 187.747 38.9888V57.0803H178.659V57.0627Z"
      fill="#2962FF"
    />
    <path
      d="M220.686 57.8038C218.422 57.8038 216.316 57.3802 214.401 56.5507C212.486 55.7034 210.936 54.4679 209.752 52.8264L210.605 50.9202V57.0802H202.109V11.207H211.215V29.8634L209.822 28.0101C210.919 26.3333 212.399 25.0272 214.279 24.1094C216.159 23.1916 218.318 22.7327 220.738 22.7327C223.889 22.7327 226.744 23.5093 229.303 25.0802C231.845 26.6334 233.882 28.7338 235.379 31.3813C236.877 34.0289 237.625 36.9941 237.625 40.2771C237.625 43.5247 236.894 46.4723 235.414 49.1375C233.934 51.8027 231.915 53.9208 229.373 55.474C226.814 57.0272 223.906 57.8038 220.686 57.8038ZM219.589 49.4905C221.295 49.4905 222.792 49.1022 224.08 48.3256C225.369 47.549 226.396 46.4547 227.11 45.0603C227.841 43.6659 228.207 42.0598 228.207 40.2594C228.207 38.4591 227.841 36.8706 227.11 35.4938C226.379 34.1171 225.369 33.0405 224.08 32.2285C222.792 31.4343 221.295 31.0283 219.589 31.0283C217.97 31.0283 216.525 31.4166 215.254 32.1932C213.983 32.9699 212.99 34.0642 212.277 35.4585C211.563 36.8529 211.215 38.4591 211.215 40.2594C211.215 42.0598 211.563 43.6659 212.277 45.0603C212.99 46.4547 213.983 47.549 215.254 48.3256C216.525 49.1022 217.97 49.4905 219.589 49.4905Z"
      fill="#2962FF"
    />
    <path
      d="M242.958 20.4381V11.207H252.063V20.4381H242.958ZM242.958 57.0625V23.4563H252.063V57.0625H242.958Z"
      fill="#2962FF"
    />
    <path
      d="M256.06 57.0632V49.6854L275.123 28.3815L276.464 31.4526H256.86V23.457H284.542V30.8349L265.966 52.1917L264.625 49.0676H284.594V57.0632H256.06Z"
      fill="#2962FF"
    />
    <path
      d="M303.926 30.8536V15.0742H305.963V30.8359H303.926V30.8536Z"
      fill="#243E77"
    />
    <path
      d="M50.1416 50.6203C39.9221 60.9811 23.348 60.9811 13.1285 50.6203C2.90899 40.2596 2.90899 23.4565 13.1285 13.0958C18.5603 7.58891 25.7854 5.01196 32.906 5.34732C22.7387 7.43005 15.0784 16.5553 15.0784 27.4985C15.0784 32.2111 16.506 36.5707 18.926 40.189C19.2916 40.7538 19.692 41.301 20.1446 41.8305C20.2317 41.9364 20.3187 42.0247 20.4058 42.1306C24.4797 46.9844 30.5731 50.0732 37.3629 50.0732C40.9319 50.0732 44.292 49.226 47.2864 47.708L50.1416 50.6203Z"
      fill="#2962FF"
    />
    <path
      d="M47.2644 47.7259C44.27 49.2439 40.9099 50.0911 37.3409 50.0911C30.5511 50.0911 24.4577 47.0023 20.3838 42.1484C20.5579 42.3426 20.732 42.5367 20.9235 42.7309C26.8428 48.732 36.4182 48.732 42.3201 42.7309L47.2644 47.7259Z"
      fill="#243E77"
    />
    <path
      d="M50.135 13.0961L42.318 21.0211C36.4161 15.0376 26.8234 15.0376 20.9215 21.0211C15.7856 26.2279 15.124 34.2588 18.9193 40.1893C16.4994 36.571 15.0718 32.2113 15.0718 27.4987C15.0718 16.5732 22.7321 7.44797 32.9168 5.36523C39.1669 5.66529 45.3473 8.24223 50.135 13.0961Z"
      fill="#26C6DA"
    />
    <path
      d="M39.2432 33.1647H29.2675C28.6407 33.1647 28.1184 32.6528 28.1184 31.9997C28.1184 31.3643 28.6233 30.8348 29.2675 30.8348H39.5392C40.3401 30.8348 41.0016 30.1641 41.0016 29.3522C41.0016 29.2463 41.0016 29.158 40.9668 29.0698C40.9494 28.9639 40.9146 28.8403 40.8624 28.7521C40.636 28.2402 40.1311 27.8872 39.5392 27.8872H37.7112C37.0844 27.8872 36.5621 27.3754 36.5621 26.7223C36.5621 26.0692 37.067 25.5574 37.7112 25.5574H37.9027C38.9299 25.5221 38.6165 25.0455 38.425 24.8161C37.3108 23.6864 36.005 22.8922 34.6123 22.398C31.0433 21.1271 26.8997 21.9391 24.0619 24.8337C24.0271 24.869 24.0097 24.8867 23.9923 24.922C23.8182 25.1514 23.6093 25.5574 24.4972 25.5574H28.0662C28.6929 25.5574 29.2152 26.0692 29.2152 26.7223C29.2152 27.3754 28.7103 27.8872 28.0662 27.8872H24.4101C22.8433 27.8872 21.4505 28.9992 21.2068 30.5701C21.0501 31.5585 21.0501 32.5469 21.1719 33.5353C21.3634 35.0179 22.6518 36.1123 24.149 36.1123H32.0878C32.7146 36.1123 33.2369 36.6241 33.2369 37.2772C33.2369 37.9126 32.732 38.4421 32.0878 38.4421H25.4721C23.5222 38.4421 23.8008 39.1305 24.1664 39.5541C25.6288 41.0014 27.4046 41.9016 29.2849 42.2722C29.9813 42.4134 30.4513 43.0488 30.3643 43.7548L29.9813 46.5083C29.8942 47.0907 30.5906 47.4261 30.991 47.0201L36.1443 41.7957L38.4598 39.4482C39.5218 38.3891 40.2878 37.1183 40.7927 35.7945C40.8275 35.7239 40.8624 35.6357 40.8798 35.5474C40.9146 35.4592 40.932 35.3709 40.9494 35.3003C41.3846 33.553 40.0267 33.2176 39.2432 33.1647ZM31.6004 25.575H33.881C34.5078 25.575 35.0301 26.0869 35.0301 26.7399C35.0301 27.393 34.5252 27.9049 33.881 27.9049H31.6004C30.9736 27.9049 30.4513 27.393 30.4513 26.7399C30.4513 26.0869 30.9736 25.575 31.6004 25.575ZM25.4373 33.1647H23.1566C22.5299 33.1647 22.0076 32.6528 22.0076 31.9997C22.0076 31.3643 22.5125 30.8348 23.1566 30.8348H25.4373C26.0641 30.8348 26.5864 31.3467 26.5864 31.9997C26.5864 32.6528 26.0641 33.1647 25.4373 33.1647ZM37.9027 38.4244H35.622C34.9953 38.4244 34.4904 37.9126 34.4904 37.2595C34.4904 36.6241 34.9953 36.0946 35.622 36.0946H37.9027C38.5294 36.0946 39.0517 36.6065 39.0517 37.2595C39.0343 37.9126 38.5294 38.4244 37.9027 38.4244Z"
      fill="#2962FF"
    />
    <path
      d="M296.388 15.0742H293.968L288.397 30.8536H290.591L295.187 17.4394L298.512 27.147H298.529L299.783 30.8536H301.959L296.388 15.0742Z"
      fill="#243E77"
    />
  </svg>
);

/* OtpTimer ===========================================================>>>>> */
type OtpTimerProps = {
  initialSeconds?: number;
  onResend: () => void;
};

export const OtpTimer: React.FC<OtpTimerProps> = ({
  initialSeconds = 60,
  onResend,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isCounting, setIsCounting] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    if (isCounting && secondsLeft > 0) {
      timer = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (secondsLeft === 0) {
      setIsCounting(false);
    }

    return () => clearInterval(timer);
  }, [secondsLeft, isCounting]);

  const handleResend = () => {
    onResend(); // Call parent resend function
    setSecondsLeft(initialSeconds); // Reset timer
    setIsCounting(true); // Restart countdown
  };

  return (
    <div className="text-center">
      {isCounting ? (
        <p className="text-sm text-gray-500">
          Resend OTP in <span className="font-semibold">{secondsLeft}s</span>
        </p>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          className="button-text text-sm text-accent underline hover:no-underline"
        >
          Resend OTP
        </button>
      )}
    </div>
  );
};
/* <<<<<<<<===================================================== OtpTimer */

/* Header ===========================================================>>>>> */

// Helper function to get current day name
const getCurrentDayName = (): string => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[new Date().getDay()];
};

// Helper function to get formatted current date
const getFormattedCurrentDate = (): string => {
  const now = new Date();
  const day = now.getDate();
  const month = now
    .toLocaleDateString("en-US", { month: "long" })
    .toLowerCase();
  const year = now.getFullYear();
  return `${day} ${month}, ${year}`;
};

export const Header = () => {
  const { userInfo } = useRole();
  const [newsocket, setNewSocket] = useState<WebSocket | null>(null);
  const [response, setResponse] = useState<any>(null);
  const jwt = localStorage.getItem("accessToken");
  const [idCallingModal, setIsCallingModal] = useState(false);
  // const navigate = useNavigate();
  // const deviceI = device_id;
  // const userId = user.id;
  // const token = accessToken;
  const socketsRef = useRef<Record<string, WebSocket>>({});

  const [chatData, setChatData] = useState<ChatRoomItem[]>([]);

  useEffect(() => {
    if (!jwt && userInfo.role !== "owner") {
      return;
    }

    const fetchDevices = async () => {
      try {
        const response = await axiosInstance.get(`/owners/devicesall/`);
        const chatList: ChatRoomItem[] = Array.isArray(response.data)
          ? response.data
          : [];
        setChatData(chatList);
      } catch (error) {
        // toast.error("Failed to load devices.");
        setChatData([]);
      }
    };
    fetchDevices();
  }, [jwt, userInfo]);

  // console.log(newsocket, "new socket in header");

  useEffect(() => {
    const restaurantId = userInfo?.restaurants?.[0]?.id;
    if (restaurantId && jwt) {
      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const wsBaseUrl = import.meta.env.VITE_WS_URL || baseUrl.replace(/^http/, "ws");
      const wsUrl = `${wsBaseUrl}/ws/calls/${restaurantId}/?token=${jwt}`;

      const ws = new WebSocket(wsUrl);
      setNewSocket(ws);

      ws.onopen = () => {
        console.log(`WebSocket connected for restaurant ${restaurantId}`);
      };

      ws.onmessage = (event) => {
        console.log(`Message from restaurant ${restaurantId}:`, event.data);
        const data = JSON.parse(event.data);
        if (data.action === "incoming_call") {
          setIsCallingModal(true);
          setResponse(data);
        }
        if (data.action === "call_ended") {
          setIsCallingModal(false);
        }
        if (data.action === "call_accepted") {
          if (data.device_id) {
            window.location.href = `https://clever-biz.vercel.app?device=${encodeURIComponent(
              data?.device_id
            )}&user=${encodeURIComponent(
              userInfo?.restaurants[0]?.resturent_name
            )}&deviceId=${data.device_id}&receiver=${encodeURIComponent(
              data?.table_id || ""
            )}&token=${encodeURIComponent(jwt)}`;
          }
        }
      };

      ws.onclose = () => {
        console.log(`WebSocket closed for restaurant ${restaurantId}`);
      };

      ws.onerror = (error) => {
        console.error(`WebSocket error for restaurant ${restaurantId}:`, error);
      };

      return () => {
        ws.close();
      };
    }
  }, [jwt, userInfo]);

  const handleEndCall = (callerId, deviceId) => {
    const data = {
      action: "end_call",
      call_id: callerId,
      device_id: deviceId,
    };
    if (newsocket && newsocket.readyState === WebSocket.OPEN) {
      newsocket.send(JSON.stringify(data));
    }
    setIsCallingModal(false);
  };

  const handleAnswerCall = (callerId, deviceId) => {
    const data = {
      action: "accept_call",
      call_id: callerId,
      device_id: deviceId,
    };
    if (newsocket && newsocket.readyState === WebSocket.OPEN) {
      newsocket.send(JSON.stringify(data));
    }
    setIsCallingModal(false);
  };
  return (
    <header className="bg-sidebar shadow-md p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-primary-text text-2xl font-medium">
          {getCurrentDayName()}
          <span className="ms-2 text-base font-normal text-primary-text/70">
            {getFormattedCurrentDate()}
          </span>
        </h2>
        <div className="rounded-full flex flex-row items-center gap-x-2">
          <span className="text-lg text-primary-text font-medium">
            Hi, {userInfo?.username}
          </span>
          <img src={profile} alt="Profile" className=" w-8 h-8" />
        </div>
      </div>
      {idCallingModal && userInfo.role === "owner" && (
        <CallerModal
          email={userInfo.username}
          handleEndCall={handleEndCall}
          handleAnswerCall={handleAnswerCall}
          response={response}
        />
      )}
    </header>
  );
};

/* <<<<<<<<===================================================== Header */

/* Dashboard Card ===========================================================>>>>> */
type DashboardCardProps = {
  label: string;
  data: string;
  tail?: string;
  icon?: React.ReactNode;
  accentColor?: string;
  gradientStart?: string;
  gradientEnd?: string;
};
export const DashboardCard: React.FC<DashboardCardProps> = ({
  label,
  data,
  icon,
  tail = "",
  accentColor = "#31BB24",
  gradientStart = "#48E03A",
  gradientEnd = "#161F42",
}) => {
  return (
    <div className="flex-1 bg-sidebar shadow-2xl shadow-black/70 flex flex-col items-start p-6 rounded-xl relative">
      <p
        className="text-lg flex items-center gap-x-2"
        style={{ color: accentColor, fill: accentColor }}
      >
        {icon && icon}
        {label}
      </p>
      <p className="text-3xl text-primary-text font-medium mt-4">{data}</p>
      <p className="text-lg text-primary-text/70 font-light mt-4">{tail}</p>

      <div className="absolute bottom-0 right-0 flex justify-end items-end">
        <CurveSvg
          strokeColor={accentColor}
          startColor={gradientStart}
          endColor={gradientEnd}
        />
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Dashboard Card */
interface StatCardProps {
  count: number | string;
  label: string;
  barColor: string;
  accentColor?: string;
}

export const StatCard = ({
  count,
  label,
  barColor,
  accentColor,
}: StatCardProps) => {
  return (
    <div className="bg-[#1B1A30] rounded-xl p-4 w-full flex flex-row justify-between shadow-md gap-x-4">
      <div className="flex flex-col items-start space-x-4">
        <div
          className={`w-1 h-full rounded-full`}
          style={{ backgroundColor: barColor }}
        />
      </div>
      <div className="w-full flex flex-col justify-between">
        <div className="flex flex-col md:flex-row justify-between md:items-center">
          <h2 className="text-2xl font-semibold text-primary-text">{count}</h2>
          <p className="text-sm text-primary-text/60">{label}</p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between mt-6">
          <FaRegCalendarCheck
            className="text-lg"
            style={{ color: accentColor }}
          />

          <div className="flex items-center text-sm text-primary-text/80 cursor-pointer hover:underline">
            Details <HiChevronRight className="ml-1" />
          </div>
        </div>
      </div>
    </div>
  );
};

/* <<<<<<<<===================================================== Stat Card */

/* Admin stat card ===========================================================>>>>> */
export const StatCardAsteric: React.FC<DashboardCardProps> = ({
  label,
  data,
  accentColor = "#31BB24",
}) => {
  return (
    <div className="flex-1 bg-sidebar shadow-2xl shadow-black/70 flex flex-col items-stretch p-6 rounded-xl relative">
      <p
        className="text-lg text-start flex items-center gap-x-2"
        style={{ color: accentColor, fill: accentColor }}
      >
        <IconStar className="h-5 w-5" /> {label}
      </p>
      <div className="flex flex-row justify-between items-center mt-6">
        <p className="text-3xl text-primary-text font-medium">{data}</p>
        <span className="w-14 h-14 bg-primary rounded-full flex justify-center items-center">
          <svg
            width="22"
            height="21"
            viewBox="0 0 22 21"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M11.0003 11.5145L13.0587 12.7604C13.2573 12.8868 13.4559 12.8824 13.6545 12.7474C13.8531 12.6123 13.9253 12.4271 13.8712 12.1916L13.3295 9.83538L15.1712 8.23746C15.3517 8.07496 15.4059 7.88104 15.3337 7.65571C15.2614 7.43038 15.0989 7.30832 14.8462 7.28954L12.4357 7.09996L11.4878 4.87913C11.3975 4.66246 11.2351 4.55413 11.0003 4.55413C10.7656 4.55413 10.6031 4.66246 10.5128 4.87913L9.56491 7.09996L7.15449 7.28954C6.90172 7.3076 6.73922 7.42965 6.66699 7.65571C6.59477 7.88177 6.64894 8.07568 6.82949 8.23746L8.67116 9.83538L8.12949 12.1916C8.07533 12.4263 8.14755 12.6116 8.34616 12.7474C8.54477 12.8832 8.74338 12.8875 8.94199 12.7604L11.0003 11.5145ZM4.50033 17.5L2.00866 19.9916C1.66561 20.3347 1.27272 20.4116 0.829994 20.2224C0.387272 20.0332 0.166272 19.6944 0.166994 19.2062V2.33329C0.166994 1.73746 0.379327 1.22757 0.803994 0.803626C1.22866 0.379682 1.73855 0.167348 2.33366 0.166626H19.667C20.2628 0.166626 20.7731 0.378959 21.1977 0.803626C21.6224 1.22829 21.8344 1.73818 21.8337 2.33329V15.3333C21.8337 15.9291 21.6217 16.4394 21.1977 16.864C20.7738 17.2887 20.2635 17.5007 19.667 17.5H4.50033ZM3.57949 15.3333H19.667V2.33329H2.33366V16.552L3.57949 15.3333Z"
              fill={accentColor}
            />
          </svg>
        </span>
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Admin stat card */

/* Device Stat Card ===========================================================>>>>> */
type DeviceDashboardCardProps = StatCardProps & { icon?: React.ReactNode };
export const DeviceDashboardCard: React.FC<DeviceDashboardCardProps> = ({
  label,
  count,
  accentColor,
  icon,
}) => {
  return (
    <div className="flex-1 bg-sidebar shadow-2xl shadow-black/70 flex flex-col items-stretch p-6 pb-2 rounded-xl relative">
      <p
        className="text-lg text-start flex items-center gap-x-2"
        style={{ color: accentColor, fill: accentColor }}
      >
        <IconArrowRight style={{ stroke: accentColor }} /> {label}
      </p>
      <div className="flex flex-row justify-between items-center mt-6">
        <p className="text-3xl text-primary-text font-medium">{count}</p>
        <span
          className="w-14 h-14 rounded-full flex justify-center items-center"
          style={{ fill: accentColor }}
        >
          {icon ?? (
            <svg
              width="22"
              height="21"
              viewBox="0 0 22 21"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11.0003 11.5145L13.0587 12.7604C13.2573 12.8868 13.4559 12.8824 13.6545 12.7474C13.8531 12.6123 13.9253 12.4271 13.8712 12.1916L13.3295 9.83538L15.1712 8.23746C15.3517 8.07496 15.4059 7.88104 15.3337 7.65571C15.2614 7.43038 15.0989 7.30832 14.8462 7.28954L12.4357 7.09996L11.4878 4.87913C11.3975 4.66246 11.2351 4.55413 11.0003 4.55413C10.7656 4.55413 10.6031 4.66246 10.5128 4.87913L9.56491 7.09996L7.15449 7.28954C6.90172 7.3076 6.73922 7.42965 6.66699 7.65571C6.59477 7.88177 6.64894 8.07568 6.82949 8.23746L8.67116 9.83538L8.12949 12.1916C8.07533 12.4263 8.14755 12.6116 8.34616 12.7474C8.54477 12.8832 8.74338 12.8875 8.94199 12.7604L11.0003 11.5145ZM4.50033 17.5L2.00866 19.9916C1.66561 20.3347 1.27272 20.4116 0.829994 20.2224C0.387272 20.0332 0.166272 19.6944 0.166994 19.2062V2.33329C0.166994 1.73746 0.379327 1.22757 0.803994 0.803626C1.22866 0.379682 1.73855 0.167348 2.33366 0.166626H19.667C20.2628 0.166626 20.7731 0.378959 21.1977 0.803626C21.6224 1.22829 21.8344 1.73818 21.8337 2.33329V15.3333C21.8337 15.9291 21.6217 16.4394 21.1977 16.864C20.7738 17.2887 20.2635 17.5007 19.667 17.5H4.50033ZM3.57949 15.3333H19.667V2.33329H2.33366V16.552L3.57949 15.3333Z"
                fill={accentColor}
              />
            </svg>
          )}
        </span>
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Device Stat Card */

/* Order list card ===========================================================>>>>> */
type OrderlistCardProps = {
  label: string;
  data: string;
  accentColor?: string;
  gradientStart?: string;
  gradientEnd?: string;
};
export const OrderlistCard: React.FC<OrderlistCardProps> = ({
  label,
  data,
  accentColor = "#31BB24",
  gradientStart = "#48E03A",
  gradientEnd = "#161F42",
}) => {
  return (
    <div className="flex-1 bg-sidebar shadow-2xl shadow-black/70 flex flex-row items-start p-6 rounded-xl relative">
      <div className="flex-1 flex flex-col h-full justify-between">
        <div className="flex">
          <IconBox color={accentColor} />
          <p className="text-lg" style={{ color: accentColor }}>
            {label}
          </p>
        </div>
        <p className="text-lg text-primary-text/70 font-light mt-4">Total</p>
      </div>
      <div className="relative">
        <ProgressSvg color={accentColor} />
        <p className="absolute top-1/2 left-1/2 -translate-1/2 text-3xl text-primary-text font-medium">
          {data}
        </p>
      </div>
      <div className="flex-1"></div>
      <div className="absolute bottom-0 right-0 flex justify-end items-end">
        <CurveSvg
          strokeColor={accentColor}
          startColor={gradientStart}
          endColor={gradientEnd}
        />
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Order list card */

/* Pagination ===========================================================>>>>> */
type PaginationProps = {
  page?: number; // current page (1-based)
  total?: number; // total items from API (e.g., DRF count)
  pageSize?: number; // items per page (default 10)
  onPageChange: (p: number) => void;
  className?: string;
};
export const Pagination: React.FC<PaginationProps> = ({
  page = 1,
  total = 0,
  pageSize = 10, // <-- no more hardcoded 10 in math
  onPageChange,
  className = "",
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(page.toString());

  // keep input synced with external page
  useEffect(() => setValue(page.toString()), [page]);

  const commit = () => {
    if (!value) {
      setValue(page.toString());
      setIsEditing(false);
      return;
    }
    const newPage = parseInt(value, 10);
    if (!Number.isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
      onPageChange(newPage);
    } else {
      setValue(page.toString());
    }
    setIsEditing(false);
  };

  // (optional) hide if no pagination needed
  if (total <= pageSize) return null;

  return (
    <div className={`inline-flex gap-x-2 mt-2 xs:mt-0 ${className}`}>
      {/* Prev */}
      <button
        className={`flex items-center justify-center px-4 h-12 text-base font-medium text-primary-text bg-table-header rounded-md hover:bg-dashboard ${!canGoPrev ? "opacity-50 cursor-not-allowed" : ""
          }`}
        onClick={() => canGoPrev && onPageChange(page - 1)}
        disabled={!canGoPrev}
      >
        <GrFormPrevious className="fill-primary-text me-4" /> Prev
      </button>

      {/* Page input / display */}
      <div
        className="flex items-center justify-center px-4 h-12 text-base font-medium text-primary-text bg-table-header rounded-md cursor-pointer hover:bg-dashboard"
        onClick={() => !isEditing && setIsEditing(true)}
      >
        {isEditing ? (
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} // digits only
            onKeyDown={(e) => e.key === "Enter" && commit()}
            onBlur={commit}
            className="bg-transparent w-full outline-none text-primary-text text-center"
          />
        ) : (
          <>
            <span>{page}</span>
            <span className="opacity-70">&nbsp;/ {totalPages}</span>
          </>
        )}
      </div>

      {/* Next */}
      <button
        className={`flex items-center justify-center px-4 h-12 text-base font-medium text-primary-text bg-table-header rounded-md hover:bg-dashboard ${!canGoNext ? "opacity-50 cursor-not-allowed" : ""
          }`}
        onClick={() => canGoNext && onPageChange(page + 1)}
        disabled={!canGoNext}
      >
        Next <GrFormNext className="fill-primary-text ms-4" />
      </button>
    </div>
  );
};
/* <<<<<<<<===================================================== Pagination */

/* Progress Indicator ===========================================================>>>>> */
interface ProgressSvgProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}
export const ProgressSvg: React.FC<ProgressSvgProps> = ({
  className,
  color,
  ...rest
}) => {
  return (
    <svg
      width="116"
      height="116"
      viewBox="0 0 116 116"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...rest}
    >
      <g filter="url(#filter0_d_0_1)">
        <circle
          cx="58"
          cy="54"
          r="43"
          stroke="#5C5B5B"
          strokeWidth="10"
          shapeRendering="crispEdges"
        />
      </g>
      <g filter="url(#filter1_d_0_1)">
        <path
          d="M15 54C15 77.7482 34.2518 97 58 97C81.7482 97 101 77.7482 101 54C101 30.2518 81.7482 11 58 11"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>
      <defs>
        <filter
          id="filter0_d_0_1"
          x="0"
          y="0"
          width="116"
          height="116"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_0_1"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_0_1"
            result="shape"
          />
        </filter>
        <filter
          id="filter1_d_0_1"
          x="0"
          y="0"
          width="116"
          height="116"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_0_1"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_0_1"
            result="shape"
          />
        </filter>
      </defs>
    </svg>
  );
};

/* <<<<<<<<===================================================== Progress Indicator */

/* Top tooltip ===========================================================>>>>> */
interface TooltipTopProps {
  tip: string;
  children: React.ReactNode;
}
export const TooltipTop: React.FC<TooltipTopProps> = ({
  tip = "",
  children,
}) => {
  return (
    <div className="relative inline-block group">
      <div className="bg-transparent rounded cursor-pointer">{children}</div>

      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 text-sm bg-black text-white rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
        {tip}
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Top tooltip */

/* Foodlist =========================================>>>>>>>>> */
interface TableFoodListProps {
  data: FoodItem[];
}
export const TableFoodList: React.FC<TableFoodListProps> = ({ data }) => {
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const { updateAvailability } = useOwner();
  const { fetchFoodItems } = useOwner();
  const { fetchStatusSummary } = useStaff();

  // Local state to track availability changes immediately
  const [localAvailability, setLocalAvailability] = useState<
    Record<number, boolean>
  >({});

  // Initialize local availability state when data changes
  useEffect(() => {
    const initialAvailability: Record<number, boolean> = {};
    data?.forEach((item) => {
      initialAvailability[item.id] = item.available;
    });
    setLocalAvailability(initialAvailability);
  }, [data]);

  function openDelete(id: number) {
    setSelectedItemId(id);
    setDeleteDialogOpen(true);
  }

  function closeDelete() {
    setDeleteDialogOpen(false);
    setSelectedItemId(null);
  }

  function openEdit(id: number) {
    setSelectedItemId(id);
    setEditDialogOpen(true);
  }

  function closeEdit() {
    setEditDialogOpen(false);
    setSelectedItemId(null);
  }

  const handleAvailabilityChange = async (
    itemId: number,
    newStatus: string
  ) => {
    const available = newStatus === "Available";

    // Immediately update local state for instant UI feedback
    setLocalAvailability((prev) => ({
      ...prev,
      [itemId]: available,
    }));

    try {
      await updateAvailability(itemId, available);
      await fetchStatusSummary();
      await fetchFoodItems();
    } catch (error) {
      console.error("Failed to update availability:", error);
      // Revert local state if API call fails
      setLocalAvailability((prev) => ({
        ...prev,
        [itemId]: !available,
      }));
    }
  };

  const contextStatuses = ["Available", "Unavailable"];
  const contextProperties = {
    Available: {
      bg: "bg-green-800",
      text: "text-green-300",
    },
    Unavailable: {
      bg: "bg-red-800",
      text: "text-red-300",
    },
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-left clever-table">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-2 text-start">Image</th>
              <th className="px-4 py-2 text-start">Name of the food</th>
              <th className="px-4 py-2 text-center">Category</th>
              <th className="px-4 py-2 text-center">Price</th>
              <th className="px-4 py-2 text-start">Action</th>
              <th className="px-4 py-2 text-start">Availability</th>
            </tr>
          </thead>
          <tbody className="bg-sidebar text-sm">
            {data?.map((item, index) => (
              <tr key={index} className="border-b  border-[#1C1E3C]">
                <td className="p-4 items-center">
                  <img
                    src={(() => {
                      if (!item.image1) return "https://placehold.co/100x100?text=No+Image";
                      let url = item.image1;
                      // Fix double media path
                      // url = url.replace("/media/media/", "/media/");
                      // Force HTTPS
                      if (url.startsWith("http://")) {
                        url = url.replace("http://", "https://");
                      }
                      // Handle relative paths
                      if (url.startsWith("/")) {
                        url = `https://cleverdining-2.onrender.com${url}`;
                      }
                      return url;
                    })()}
                    alt="Food Item"
                    className="bg-dashboard/50 w-12 h-12 rounded-md"
                    onError={(e) => {
                      e.currentTarget.src = "https://placehold.co/100x100?text=No+Image";
                    }}
                  />
                </td>
                <td className="p-4 text-primary-text truncate text-start">{item.name.substring(0, 30) + '...'}</td>
                <td className="p-4 text-primary-text text-center">{item.category}</td>
                <td className="p-4 text-primary-text text-center">{item.price}</td>
                <td className="h-20 p-4 flex gap-x-4 items-center">
                  <button
                    onClick={() => openEdit(item?.id)}
                    className="text-blue-100 hover:text-blue-600"
                  >
                    <IconEdit className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => openDelete(item?.id)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <IconDelete className="h-6 w-6" />
                  </button>
                </td>
                <td className="p-4 text-start" >
                  <ButtonStatus
                    status={
                      localAvailability[item.id] !== undefined
                        ? localAvailability[item.id]
                          ? "Available"
                          : "Unavailable"
                        : item.available
                          ? "Available"
                          : "Unavailable"
                    }
                    properties={contextProperties}
                    availableStatuses={contextStatuses}
                    onChange={(newStatus) =>
                      handleAvailabilityChange(item.id, newStatus)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditFoodItemModal
        isOpen={isEditDialogOpen}
        close={closeEdit}
        id={selectedItemId}
      />
      <DeleteFoodItemModal
        isOpen={isDeleteDialogOpen}
        close={closeDelete}
        id={selectedItemId}
      />
    </>
  );
};

/* <<<<<<<<========================================== Foodlist */

/* Chat Page Section ===========================================================>>>>> */

export interface ChatRoomItem {
  id: string;
  table_name: string;
  user_id?: string;
}

export type MsgType = {
  message?: string;
  is_from_device?: boolean;
  sender?: string;
  timestamp?: string | number;
  // other fields your backend sends...
  [k: string]: any;
};

// ---- Component ----
export const ChatSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<ChatRoomItem | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [chatData, setChatData] = useState<ChatRoomItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null); // active chat socket
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<MsgType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { userInfo } = useRole();
  const chatBodyRef = useRef<HTMLDivElement | null>(null);

  // call-related refs/state
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [callStatus, setCallStatus] = useState<
    "idle" | "calling" | "in_call" | "ended"
  >("idle");

  // 🔔 inbox meta: unread + hasNew + lastAt + lastPreview
  const [inboxMap, setInboxMap] = useState<
    Record<
      string,
      { unread: number; hasNew: boolean; lastAt: number; lastPreview: string }
    >
  >({});

  // background sockets for non-active inboxes
  const bgSocketsRef = useRef<Record<string, WebSocket>>({});

  // Devices fetch
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const response = await axiosInstance.get(
          `/owners/devicesall/?search=${searchQuery}`
        );
        const chatList: ChatRoomItem[] = Array.isArray(response.data)
          ? response.data
          : [];
        setChatData(chatList);
        setInboxMap((prev) => {
          const next = { ...prev };
          for (const c of chatList) {
            if (!next[c.id])
              next[c.id] = {
                unread: 0,
                hasNew: false,
                lastAt: 0,
                lastPreview: "",
              };
          }
          return next;
        });
        if (chatList.length > 0 && !selectedChat) setSelectedChat(chatList[0]);
      } catch (error) {
        toast.error("Failed to load devices.");
        setChatData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);
  console.log(selectedChat);
  // Fetch previous messages when selectedChat changes
  useEffect(() => {
    if (!selectedChat) return;
    const device_id = selectedChat.id;
    const restaurant_id = userInfo?.restaurants?.[0]?.id;
    const fetchMessages = async () => {
      console.log("DEBUG: fetchMessages", { device_id, restaurant_id, userInfo });
      try {
        const response = await axiosInstance.get(
          `/message/chat/?device_id=${device_id}&restaurant_id=${restaurant_id}`
        );
        setMessages(response.data || []);
      } catch (error: any) {
        console.error("DEBUG: fetchMessages failed", error);
        if (error.response) {
          console.error("DEBUG: Error response", error.response.status, error.response.data);
        }
        toast.error(`Failed to load previous messages: ${error.message}`);
        setMessages([]);
      }
    };
    fetchMessages();
  }, [selectedChat, userInfo]);

  // Active chat WebSocket
  useEffect(() => {
    if (!selectedChat) return;
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) {
      toast.error("No access token found");
      return;
    }
    if (socket.current) {
      socket.current.close();
    }
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const wsBaseUrl = import.meta.env.VITE_WS_URL || baseUrl.replace(/^http/, "ws");
    const ws = new WebSocket(
      `${wsBaseUrl}/ws/chat/${selectedChat.id}/?token=${accessToken}`
    );
    socket.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);

      // call events
      if (data.type === "answer") setCallStatus("in_call");
      else if (data.action === "call_ended") setCallStatus("ended");

      // update active inbox meta (no unread/hasNew because you're inside)
      setInboxMap((prev) => {
        const cur = prev[selectedChat.id] ?? {
          unread: 0,
          hasNew: false,
          lastAt: 0,
          lastPreview: "",
        };
        return {
          ...prev,
          [selectedChat.id]: {
            ...cur,
            lastAt: Date.now(),
            lastPreview: data?.message ?? cur.lastPreview,
          },
        };
      });
    };
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    return () => {
      ws.close();
    };
  }, [selectedChat]);

  // Background sockets for other inboxes
  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    if (!chatData?.length) return;

    chatData.forEach((c) => {
      const id = c.id;
      if (selectedChat?.id === id) return; // active has its own socket
      if (bgSocketsRef.current[id]) return; // already open

      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const wsBaseUrl = import.meta.env.VITE_WS_URL || baseUrl.replace(/^http/, "ws");
      const ws = new WebSocket(
        `${wsBaseUrl}/ws/chat/${id}/?token=${accessToken}`
      );
      bgSocketsRef.current[id] = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setInboxMap((prev) => {
          const cur = prev[id] ?? {
            unread: 0,
            hasNew: false,
            lastAt: 0,
            lastPreview: "",
          };
          return {
            ...prev,
            [id]: {
              unread: cur.unread + 1,
              hasNew: true,
              lastAt: Date.now(),
              lastPreview: data?.message ?? cur.lastPreview,
            },
          };
        });
      };

      ws.onclose = () => {
        delete bgSocketsRef.current[id];
      };
      ws.onerror = () => {
        // optional: handle error/reconnect
      };
    });
  }, [chatData, selectedChat]);

  // open inbox => reset unread + hasNew
  const openInbox = (chat: ChatRoomItem) => {
    setSelectedChat(chat);
    setInboxMap((prev) => {
      const cur = prev[chat.id] ?? {
        unread: 0,
        hasNew: false,
        lastAt: 0,
        lastPreview: "",
      };
      return {
        ...prev,
        [chat.id]: { ...cur, unread: 0, hasNew: false },
      };
    });
  };

  // Auto-scroll to bottom when messages / selectedChat change
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages, selectedChat]);

  // ---- Calling ----
  const startConnection = async () => {
    const device_id = selectedChat?.id;
    const user_id = selectedChat?.user_id;
    if (!selectedChat) return;
    const accessToken = localStorage.getItem("accessToken");
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const wsBaseUrl = import.meta.env.VITE_WS_URL || baseUrl.replace(/^http/, "ws");
    const socket = new WebSocket(
      `${wsBaseUrl}/ws/call/${device_id}/?token=${accessToken}`
    );

    socket.onopen = async () => {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (localAudioRef.current) localAudioRef.current.srcObject = localStream;

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      localStream
        .getTracks()
        .forEach((track) => peer.addTrack(track, localStream));

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.send(
            JSON.stringify({ type: "candidate", candidate: event.candidate })
          );
        }
      };

      peer.ontrack = (event) => {
        if (remoteAudioRef.current)
          remoteAudioRef.current.srcObject = event.streams[0];
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket.send(
        JSON.stringify({
          action: "start_call",
          receiver_id: user_id,
          device_id,
          type: "offer",
          offer,
        })
      );

      let remoteCandidatesQueue: any[] = [];

      socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "answer") {
          await peer.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
          for (const candidate of remoteCandidatesQueue) {
            try {
              await peer.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.error("Error adding queued ICE candidate", e);
            }
          }
          remoteCandidatesQueue = [];
          setCallStatus("in_call");
        } else if (data.type === "candidate") {
          if (peer.remoteDescription && peer.remoteDescription.type) {
            try {
              await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.error("Error adding ICE candidate", e);
            }
          } else {
            remoteCandidatesQueue.push(data.candidate);
          }
        } else if (data.action === "call_ended") {
          peer.close();
          socket.close();
          setCallStatus("ended");
        }
      };

      // Save refs
      socketRef.current = socket;
      peerRef.current = peer;
      localStreamRef.current = localStream;
    };
  };

  const handleSend = () => {
    if (!inputMessage.trim()) return;
    if (!socket.current || socket.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      toast.error("Connection lost. Please refresh the page.");
      return;
    }
    try {
      socket.current.send(
        JSON.stringify({ type: "message", message: inputMessage })
      );
      setInputMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    }
  };

  //////////////// Calling started ////////////////////////
  const [newsocket, setNewSocket] = useState<WebSocket | null>(null);
  const [response, setResponse] = useState<any>(null);
  const jwt = localStorage.getItem("accessToken");
  const [idCallingModal, setIsCallingModal] = useState(false);
  // const navigate = useNavigate();
  // const deviceI = device_id;
  // const userId = user.id;
  // const token = accessToken;

  useEffect(() => {
    if (selectedChat) {
      localStorage.setItem("selectedChatInfo", JSON.stringify(selectedChat));
    }
  }, [selectedChat]);

  const singleuser = localStorage.getItem("selectedChatInfo");

  useEffect(() => {
    if (!jwt && userInfo.role !== "owner") {
      return;
    }
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const wsBaseUrl = import.meta.env.VITE_WS_URL || baseUrl.replace(/^http/, "ws");
    const newSoket = new WebSocket(
      `${wsBaseUrl}/ws/call/${selectedChat?.id}/?token=${jwt}`
    );
    newSoket.onopen = () => {
      console.log("Socket Opened");
    };
    newSoket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setResponse(data);
      if (data.action === "incoming_call") {
        setIsCallingModal(true);
      }
      if (data.action === "call_ended") {
        setIsCallingModal(false);
      }
      if (data.action === "call_accepted") {
        window.location.href = `https://clever-biz.vercel.app?device=${encodeURIComponent(
          data?.device_id
        )}&user=${encodeURIComponent(
          userInfo?.restaurants[0]?.resturent_name
        )}&deviceId=${data.device_id}&receiver=${encodeURIComponent(
          JSON.parse(singleuser)?.table_name
        )}&token=${encodeURIComponent(jwt)}`;
      }
      if (data.action === "call_accepted") {
        setTimeout(() => {
          const endCallPayload = {
            action: "end_call",
            call_id: data?.call_id,
            device_id: data?.device_id,
          };
          newSoket.send(JSON.stringify(endCallPayload));
        }, 5000);
      }
    };

    newSoket.onclose = () => {
      console.log("Socket Closed");
    };

    newSoket.onerror = () => {
      console.log("Socket Error");
    };

    setNewSocket(newSoket);

    return () => {
      newSoket.close();
    };
  }, [jwt, userInfo, selectedChat?.id, singleuser]);

  const handleEndCall = (callerId, deviceId) => {
    const data = {
      action: "end_call",
      call_id: callerId,
      device_id: deviceId,
    };
    newsocket.send(JSON.stringify(data));
    setIsCallingModal(false);
  };

  const handleAnswerCall = (callerId, deviceId) => {
    const data = {
      action: "accept_call",
      call_id: callerId,
      device_id: deviceId,
    };
    newsocket.send(JSON.stringify(data));
    setIsCallingModal(false);
  };

  const confirmToCall = (receiver_id) => {
    const data = {
      action: "start_call",
      receiver_id: receiver_id,
      device_id: selectedChat?.id,
    };

    newsocket.send(JSON.stringify(data));
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-white">Loading devices...</div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col border-2 border-sidebar rounded-xl">
        <h2 className="text-primary-text bg-chat-sender/20 p-4 rounded-t-xl">
          Customer Message
        </h2>
        <div className="flex flex-row items-center">
          <div className="w-92 p-4">
            <TextSearchBoxCompact
              className="h-12"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by table name..."
            />
          </div>
          {/* Header */}
          <div className="flex-1 flex items-center justify-between p-4 border-[#2B2A40] text-primary-text">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-[#292758] flex items-center justify-center">
                <span>{selectedChat?.id || "N/A"}</span>
              </div>
              <span className="font-medium">
                {selectedChat?.table_name || "Select a table"}
              </span>
            </div>
            {userInfo?.role === "owner" && (
              <button
                onClick={() => confirmToCall(selectedChat?.user_id)}
                className="button-primary bg-sidebar rounded-lg text-base flex items-center space-x-2"
                disabled={!selectedChat}
              >
                <IoCall className="w-4 h-4" />

                <span>Call to customer</span>
              </button>
            )}
          </div>
        </div>

        {/* caller modal  */}
        {idCallingModal && userInfo.role === "owner" && (
          <CallerModal
            email={userInfo.username}
            handleEndCall={handleEndCall}
            handleAnswerCall={handleAnswerCall}
            response={response}
          />
        )}

        <div className="flex-1 flex h-full text-white border-t-2 border-chat-sender/20 overflow-hidden">
          {/* Left Chat List */}
          <div className="w-92 bg-sidebar p-2 overflow-y-auto scrollbar-hide flex-shrink-0">
            <div className="divide-y divide-chat-sender/10">
              {Array.isArray(chatData) &&
                chatData.map((chat) => {
                  const meta =
                    inboxMap[chat.id] ?? ({ unread: 0, hasNew: false } as any);
                  return (
                    <ChatListItem
                      key={chat.id}
                      data={chat}
                      isSelected={selectedChat?.id === chat.id}
                      hasNew={meta.hasNew}
                      unread={meta.unread}
                      onClick={() => openInbox(chat)}
                    />
                  );
                })}
            </div>
          </div>

          {/* Right Chat Window */}
          <div className="flex-1 flex flex-col bg-chat-container/60 border-l-2 border-blue-900/10">
            {/* Chat Body - Scrollable */}
            <div
              className="flex-1 px-6 py-4 space-y-2 overflow-y-auto scrollbar-hide"
              ref={chatBodyRef}
            >
              {selectedChat ? (
                messages?.map((msg, index) => {
                  const isSameSenderAsPrev =
                    index > 0 && messages[index - 1]?.sender === msg.sender;
                  const isSameSenderAsNext =
                    index < messages.length - 1 &&
                    messages[index + 1]?.sender === msg.sender;

                  const isSingleMessage =
                    !isSameSenderAsPrev && !isSameSenderAsNext;
                  const isMiddleMessage =
                    isSameSenderAsPrev && isSameSenderAsNext;
                  const isFirstInGroup =
                    !isSameSenderAsPrev && isSameSenderAsNext;
                  const isLastInGroup =
                    isSameSenderAsPrev && !isSameSenderAsNext;

                  const isUser = msg.is_from_device === false; // todo: reverse in production

                  return (
                    <div
                      key={index}
                      className={cn("flex", {
                        "justify-end": isUser,
                        "justify-start": !isUser,
                      })}
                    >
                      <div
                        className={cn(
                          "max-w-xs py-2 px-3 text-primary-text flex flex-col",
                          isUser ? "bg-chat-sender" : "bg-chat-receiver/40",
                          {
                            "rounded-xl": isSingleMessage,
                            "rounded-l-xl": isMiddleMessage,
                            [isUser
                              ? "rounded-t-xl rounded-l-xl"
                              : "rounded-t-xl rounded-r-xl"]: isFirstInGroup,
                            [isUser
                              ? "rounded-b-xl rounded-l-xl"
                              : "rounded-b-xl rounded-r-xl"]: isLastInGroup,
                          }
                        )}
                      >
                        <span>{msg.message}</span>
                        <span className="text-[10px] text-primary-text/40 self-end mt-1">
                          {formatTimestamp(
                            (msg?.timestamp ?? Date.now()).toString()
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center justify-center h-full text-white/60">
                  Select a table to view messages
                </div>
              )}
            </div>

            {/* Footer Input */}
            <div className="p-2 border-t border-blue-800/10 ">
              <div className="flex items-center relative min-h-16">
                <textarea
                  placeholder="Type a message"
                  className="flex-1 h-full min-h-16 bg-dashboard px-4 py-2 rounded text-sm placeholder:text-white/40 outline-none resize-none me-14"
                  rows={2}
                  disabled={!selectedChat}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  className="absolute right-2 bg-sidebar p-2 rounded"
                  disabled={!selectedChat}
                  onClick={handleSend}
                >
                  <IconSend className="text-white w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ModalCallConfirm
        isOpen={isConfirmOpen}
        confirm={() => {
          setIsConfirmOpen(false);
          setIsCallOpen(true);
          startConnection();
        }}
        close={() => setIsConfirmOpen(false)}
      />

      <ModalCall
        socketRef={socketRef}
        peerRef={peerRef}
        localStreamRef={localStreamRef}
        isOpen={isCallOpen}
        callStatus={callStatus}
        close={() => setIsCallOpen(false)}
      />

      {/* Audio elements for call */}
      <audio ref={localAudioRef} autoPlay muted style={{ display: "none" }} />
      <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />
    </>
  );
};

interface ChatListItemProps {
  data: ChatRoomItem;
  isSelected: boolean;
  onClick: () => void;
  hasNew?: boolean;
  unread?: number;
}

const ChatListItem: React.FC<ChatListItemProps> = ({
  isSelected,
  data,
  onClick,
  hasNew = false,
  unread = 0,
}) => {
  return (
    <div
      className={cn(
        "px-3 py-2 cursor-pointer flex justify-between items-center rounded my-1",
        { "bg-chat-sender/20": isSelected },
        { "hover:bg-[#1B1A30]": !isSelected }
      )}
      onClick={onClick}
    >
      <div className="relative">
        <p className="h-10 w-10 bg-[#292758]/50 rounded-full flex justify-center items-center">
          <span className="text-xl">{data.table_name}</span>
        </p>
        {hasNew && (
          <>
            <span
              className="absolute -right-0 -bottom-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-sidebar"
              aria-label="New message"
            />
            <span className="absolute -right-0 -bottom-0 inline-flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col items-end gap-y-1">
        {unread > 0 && (
          <span className="text-xs bg-red-600 text-white rounded-full px-2 py-0.5">
            {unread}
          </span>
        )}
      </div>
    </div>
  );
};

/* <<<<<<<<===================================================== Chat Page Section */

/* Most selling section restaurant dashboard ===========================================================>>>>> */

interface DashboardMostSellingItemsProps {
  data: {
    item_name: string;
    percentage: number;
    totalSell: number;
  }[];

  containerProps?: React.HTMLAttributes<HTMLDivElement>;
}
export const DashboardMostSellingItems: React.FC<
  DashboardMostSellingItemsProps
> = ({ data, containerProps }) => {
  const { className, ...rest } = containerProps ?? {};
  return (
    <div
      className={cn("flex flex-col gap-y-2 w-full overflow-y-auto", className)}
      {...rest}
    >
      {data?.map((item, idx) => (
        <div key={idx} className="flex flex-col gap-y-1">
          <div className="flex flex-row justify-between">
            <p className="text-primary-text">{item.item_name}</p>
            <p className="text-primary-text">{item.percentage}%</p>
          </div>
          <Progress
            className="bg-primary-text/30"
            value={item.percentage}
            max={item.totalSell}
            indicatorProps={{
              className: "bg-orange-400",
            }}
          />
        </div>
      ))}
    </div>
  );
};
/* <<<<<<<<===================================================== Most selling section restaurant dashboard */

/* Social Buttons ===========================================================>>>>> */

export const SocialContactButtons: React.FC<React.ComponentProps<"div">> = ({
  className,
  ...rest
}) => {
  return (
    <div
      className={cn("flex flex-row gap-x-4 items-center", className)}
      {...rest}
    >
      <Link to="#" className="text-white hover:text-accent">
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          className="fill-inherit"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M15 0.0605469C6.75 0.0605469 0 6.79555 0 15.0905C0 22.5905 5.49 28.8155 12.66 29.9405V19.4405H8.85V15.0905H12.66V11.7755C12.66 8.01055 14.895 5.94055 18.33 5.94055C19.965 5.94055 21.675 6.22555 21.675 6.22555V9.93055H19.785C17.925 9.93055 17.34 11.0855 17.34 12.2705V15.0905H21.51L20.835 19.4405H17.34V29.9405C20.8747 29.3823 24.0933 27.5788 26.4149 24.8556C28.7365 22.1325 30.008 18.669 30 15.0905C30 6.79555 23.25 0.0605469 15 0.0605469Z" />
        </svg>
      </Link>
      <Link to="#" className="text-white hover:text-accent">
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          className="fill-inherit"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M15.0002 10.3139C12.4197 10.3139 10.3138 12.4198 10.3138 15.0003C10.3138 17.5807 12.4197 19.6866 15.0002 19.6866C17.5806 19.6866 19.6865 17.5807 19.6865 15.0003C19.6865 12.4198 17.5806 10.3139 15.0002 10.3139ZM29.0556 15.0003C29.0556 13.0596 29.0732 11.1366 28.9642 9.19948C28.8552 6.94948 28.342 4.95261 26.6967 3.3073C25.0478 1.65847 23.0545 1.1487 20.8045 1.03972C18.8638 0.930733 16.9408 0.948311 15.0037 0.948311C13.0631 0.948311 11.14 0.930733 9.2029 1.03972C6.9529 1.1487 4.95603 1.66198 3.31071 3.3073C1.66189 4.95612 1.15212 6.94948 1.04314 9.19948C0.934151 11.1401 0.951729 13.0632 0.951729 15.0003C0.951729 16.9374 0.934151 18.8639 1.04314 20.801C1.15212 23.051 1.6654 25.0479 3.31071 26.6932C4.95954 28.3421 6.9529 28.8518 9.2029 28.9608C11.1435 29.0698 13.0666 29.0522 15.0037 29.0522C16.9443 29.0522 18.8674 29.0698 20.8045 28.9608C23.0545 28.8518 25.0513 28.3385 26.6967 26.6932C28.3455 25.0444 28.8552 23.051 28.9642 20.801C29.0767 18.8639 29.0556 16.9409 29.0556 15.0003ZM15.0002 22.2108C11.0099 22.2108 7.78962 18.9905 7.78962 15.0003C7.78962 11.01 11.0099 7.78972 15.0002 7.78972C18.9904 7.78972 22.2107 11.01 22.2107 15.0003C22.2107 18.9905 18.9904 22.2108 15.0002 22.2108ZM22.506 9.17839C21.5744 9.17839 20.822 8.42605 20.822 7.4944C20.822 6.56276 21.5744 5.81042 22.506 5.81042C23.4377 5.81042 24.19 6.56276 24.19 7.4944C24.1903 7.71563 24.1469 7.93473 24.0624 8.13917C23.9779 8.3436 23.8538 8.52935 23.6974 8.68578C23.541 8.84221 23.3552 8.96624 23.1508 9.05077C22.9464 9.1353 22.7272 9.17867 22.506 9.17839Z" />
        </svg>
      </Link>
      <Link to="#" className="text-white hover:text-accent">
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          className="fill-inherit"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g clipPath="url(#clip0_1_7009)">
            <path d="M15 0C23.2929 0 30 6.70714 30 15C30 23.2929 23.2929 30 15 30C6.70714 30 0 23.2929 0 15C0 6.70714 6.70714 0 15 0ZM12.2571 22.9071C18.9 22.9071 22.5429 17.4 22.5429 12.6214V12.15C23.25 11.6357 23.8714 10.9929 24.3429 10.2643C23.7 10.5429 22.9929 10.7357 22.2643 10.8429C23.0143 10.3929 23.5929 9.68571 23.85 8.85C23.1429 9.25714 22.3714 9.55714 21.5571 9.72857C20.8929 9.02143 19.95 8.59286 18.9214 8.59286C16.9286 8.59286 15.3 10.2214 15.3 12.2143C15.3 12.4929 15.3214 12.7714 15.4071 13.0286C12.4071 12.8786 9.72857 11.4429 7.95 9.25714C7.65 9.79286 7.45714 10.4143 7.45714 11.0786C7.45714 12.3214 8.1 13.4357 9.06429 14.0786C8.46429 14.0786 7.90714 13.9071 7.43571 13.6286V13.6714C7.43571 15.4286 8.67857 16.8857 10.3286 17.2286C10.0286 17.3143 9.70714 17.3571 9.38571 17.3571C9.15 17.3571 8.93571 17.3357 8.7 17.2929C9.15 18.7286 10.5 19.7786 12.0643 19.8C10.8214 20.7643 9.25714 21.3429 7.56429 21.3429C7.26429 21.3429 6.98571 21.3429 6.70714 21.3C8.29286 22.3286 10.2 22.9286 12.2357 22.9286" />
          </g>
          <defs>
            <clipPath id="clip0_1_7009">
              <rect width="30" height="30" rx="15" />
            </clipPath>
          </defs>
        </svg>
      </Link>
      <Link to="#" className="text-white hover:text-accent">
        <svg
          width="27"
          height="27"
          viewBox="0 0 27 27"
          fill="none"
          className="fill-inherit"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g clipPath="url(#clip0_1_7011)">
            <path d="M0 1.93388C0 0.865687 0.887625 0 1.98281 0H25.0172C26.1124 0 27 0.865687 27 1.93388V25.0661C27 26.1343 26.1124 27 25.0172 27H1.98281C0.887625 27 0 26.1343 0 25.0661V1.93388ZM6.31547 22.6024C7.43431 22.6024 8.34131 21.6954 8.34131 20.5765V12.436C8.34131 11.3172 7.43431 10.4102 6.31547 10.4102C5.19663 10.4102 4.28963 11.3172 4.28963 12.436V20.5765C4.28963 21.6954 5.19663 22.6024 6.31547 22.6024ZM6.31631 8.74463C7.72875 8.74463 8.60794 7.80975 8.60794 6.63863C8.58262 5.44219 7.73044 4.53263 6.34331 4.53263C4.95619 4.53263 4.05 5.44387 4.05 6.63863C4.05 7.80975 4.92919 8.74463 6.28931 8.74463H6.31631ZM12.5782 22.6024C13.694 22.6024 14.5986 21.6978 14.5986 20.582V15.7933C14.5986 15.4288 14.6256 15.0643 14.7336 14.8044C15.0255 14.0771 15.6921 13.3228 16.8126 13.3228C18.279 13.3228 18.8646 14.4399 18.8646 16.0802V20.5765C18.8646 21.6954 19.7716 22.6024 20.8904 22.6024C22.0092 22.6024 22.9163 21.6954 22.9163 20.5765V15.6094C22.9163 11.8631 20.9182 10.1216 18.252 10.1216C16.1021 10.1216 15.1386 11.3029 14.5986 12.1348V12.1674C14.5986 12.1727 14.5943 12.177 14.589 12.177C14.5815 12.177 14.5769 12.1687 14.581 12.1623L14.5986 12.1348C14.5986 11.1823 13.8264 10.4102 12.8739 10.4102H12.6183C11.4903 10.4102 10.5661 11.3489 10.5692 12.4769C10.5754 14.7634 10.5649 18.3425 10.5567 20.5761C10.5526 21.6956 11.4588 22.6024 12.5782 22.6024Z" />
          </g>
          <defs>
            <clipPath id="clip0_1_7011">
              <rect width="27" height="27" rx="4" />
            </clipPath>
          </defs>
        </svg>
      </Link>
    </div>
  );
};

/* <<<<<<<<===================================================== Social Buttons */

export const SubscriptionIcon1 = () => {
  return (
    <svg
      width={59}
      height={59}
      viewBox="0 0 59 59"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="1.91062"
        y="1.73685"
        width="56.1207"
        height="56.121"
        rx="28.0603"
        stroke="#0F9BFB"
        strokeOpacity="0.1"
        strokeWidth="1.93523"
      />
      <rect
        x="2.87823"
        y="2.70447"
        width="54.1854"
        height="54.1858"
        rx="27.0927"
        fill="url(#paint0_radial_5_232)"
      />
      <g filter="url(#filter0_d_5_232)">
        <path
          d="M29.7413 30.0359C29.737 30.0664 28.9072 36.0135 26.4649 39.1785C26.2899 39.4507 26.0847 39.7115 25.8487 39.9539C24.1001 41.7497 21.3451 41.9038 19.6964 40.2986C18.0482 38.6933 18.1297 35.9362 19.878 34.1404C20.2745 33.7333 20.7231 33.4106 21.1983 33.1736C24.4008 30.9243 29.7413 30.0359 29.7413 30.0359ZM30.1573 30.0408C30.1982 30.0465 35.5314 30.7946 38.7804 32.949C39.262 33.1733 39.7196 33.484 40.127 33.8806C41.9225 35.6291 42.0775 38.3833 40.4727 40.032C38.8674 41.6806 36.1095 41.5989 34.3136 39.8504C34.0715 39.6146 33.8589 39.3606 33.6768 39.0935C31.1504 35.9951 30.1624 30.0712 30.1573 30.0408ZM34.0538 19.6414C35.8023 17.8455 38.5573 17.6906 40.2061 19.2957C41.8546 20.901 41.773 23.659 40.0245 25.4549C39.7866 25.6991 39.5296 25.9123 39.2598 26.0955C36.1516 28.6243 30.2149 29.6111 30.2149 29.6111C30.2149 29.6111 30.9601 24.2506 33.1221 20.989C33.3464 20.507 33.6569 20.0491 34.0538 19.6414ZM19.4698 19.5984C21.0751 17.9499 23.8321 18.0306 25.628 19.7791C25.8708 20.0155 26.0832 20.2709 26.2657 20.5388C28.7866 23.6325 29.7759 29.5383 29.7843 29.5886C29.7486 29.5837 24.4096 28.8359 21.1593 26.6795C20.6784 26.4553 20.2213 26.1458 19.8145 25.7498C18.0187 24.0013 17.8649 21.2472 19.4698 19.5984Z"
          fill="url(#paint1_radial_5_232)"
        />
      </g>
      <ellipse
        cx="29.9555"
        cy="29.8194"
        rx="0.260415"
        ry="6.58479"
        fill="url(#paint2_radial_5_232)"
      />
      <ellipse
        cx="29.9184"
        cy="29.8194"
        rx="0.260415"
        ry="6.58479"
        transform="rotate(-90 29.9184 29.8194)"
        fill="url(#paint3_radial_5_232)"
      />
      <defs>
        <filter
          id="filter0_d_5_232"
          x="12.5544"
          y="16.2511"
          width="34.8332"
          height="34.8335"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3.87045" />
          <feGaussianBlur stdDeviation="2.90284" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_5_232"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_5_232"
            result="shape"
          />
        </filter>
        <radialGradient
          id="paint0_radial_5_232"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(29.971 44.7952) rotate(90) scale(31.9309 31.9307)"
        >
          <stop stopColor="#058BF7" />
          <stop offset={1} stopColor="#1AADFE" />
        </radialGradient>
        <radialGradient
          id="paint1_radial_5_232"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(29.971 29.7974) rotate(90) scale(38.9418 38.9412)"
        >
          <stop stopColor="white" />
          <stop offset={1} stopColor="#A5D6FD" />
        </radialGradient>
        <radialGradient
          id="paint2_radial_5_232"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(29.9555 29.8194) rotate(90) scale(6.58479 0.260415)"
        >
          <stop stopColor="white" />
          <stop offset={1} stopColor="white" stopOpacity={0} />
        </radialGradient>
        <radialGradient
          id="paint3_radial_5_232"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(29.9184 29.8194) rotate(90) scale(6.58479 0.260415)"
        >
          <stop stopColor="white" />
          <stop offset={1} stopColor="white" stopOpacity={0} />
        </radialGradient>
      </defs>
    </svg>
  );
};

export const SubscriptionIcon2 = () => {
  return (
    <svg
      width={55}
      height={55}
      viewBox="0 0 55 55"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="0.472839"
        y="0.704468"
        width="54.1866"
        height="54.1856"
        rx="27.0928"
        fill="url(#paint0_radial_2014_12)"
        fillOpacity="0.5"
      />
      <rect
        x="0.472839"
        y="0.704468"
        width="54.1866"
        height="54.1856"
        rx="27.0928"
        fill="url(#paint1_radial_2014_12)"
        fillOpacity="0.8"
      />
      <rect
        x="0.956646"
        y="1.18827"
        width="53.219"
        height="53.218"
        rx="26.609"
        stroke="white"
        strokeOpacity="0.24"
        strokeWidth="0.967613"
      />
      <g filter="url(#filter0_d_2014_12)">
        <path
          d="M38.1418 23.3052C40.8511 23.3052 43.0479 25.3166 43.048 27.7974C43.048 30.2783 40.8513 32.2896 38.1418 32.2896C37.7736 32.2895 37.4146 32.2516 37.0695 32.1812C33.1805 31.7305 28.5251 28.545 27.6662 27.937C28.2405 28.7446 31.1119 32.9199 31.8166 36.646C32.006 37.1867 32.1115 37.7733 32.1115 38.3862C32.1113 41.0883 30.0946 43.2784 27.6076 43.2788C25.1204 43.2787 23.1039 41.0884 23.1037 38.3862C23.1037 38.0212 23.1413 37.665 23.2111 37.3228C23.6604 33.4402 26.8598 28.7883 27.467 27.9351C26.6117 28.5406 21.9539 31.7303 18.0627 32.1812C17.7176 32.2516 17.3587 32.2895 16.9904 32.2896C14.281 32.2895 12.0842 30.2782 12.0842 27.7974C12.0844 25.3167 14.2812 23.3053 16.9904 23.3052C17.6048 23.3052 18.1926 23.4102 18.7346 23.5991C22.6515 24.336 27.0645 27.4476 27.5607 27.8042C27.5635 27.8004 27.566 27.7982 27.5666 27.7974C27.5669 27.7977 27.568 27.7998 27.5705 27.8032C28.0642 27.4484 32.4794 24.3364 36.3976 23.5991C36.9396 23.4102 37.5274 23.3053 38.1418 23.3052ZM27.5275 12.3159C30.0144 12.3163 32.0312 14.5065 32.0314 17.2085C32.0314 17.5736 31.9938 17.9297 31.924 18.272C31.4301 22.5417 27.6083 27.742 27.5676 27.7974C27.5676 27.7974 24.1013 23.094 23.3176 18.9478C23.1284 18.4073 23.0236 17.8211 23.0236 17.2085C23.0239 14.5063 25.0403 12.3159 27.5275 12.3159Z"
          fill="url(#paint2_radial_2014_12)"
        />
      </g>
      <defs>
        <filter
          id="filter0_d_2014_12"
          x="6.27849"
          y="10.3807"
          width="42.5752"
          height="42.5742"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3.87045" />
          <feGaussianBlur stdDeviation="2.90284" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_2014_12"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2014_12"
            result="shape"
          />
        </filter>
        <radialGradient
          id="paint0_radial_2014_12"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(27.5661 17.2141) rotate(-90) scale(27.5161 36.253)"
        >
          <stop stopColor="#F3F3F7" stopOpacity={0} />
          <stop offset={1} stopColor="white" stopOpacity="0.3" />
        </radialGradient>
        <radialGradient
          id="paint1_radial_2014_12"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(27.5661 17.6375) rotate(-90) scale(27.9395 36.8107)"
        >
          <stop stopColor="#F3F3F7" stopOpacity={0} />
          <stop offset={1} stopColor="white" stopOpacity="0.3" />
        </radialGradient>
        <radialGradient
          id="paint2_radial_2014_12"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(27.5661 27.7974) rotate(90) scale(51.9224 51.924)"
        >
          <stop stopColor="white" />
          <stop offset={1} stopColor="white" />
        </radialGradient>
      </defs>
    </svg>
  );
};

export const SubscriptionIcon3 = () => {
  return (
    <svg
      width={59}
      height={59}
      viewBox="0 0 59 59"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="1.73696"
        y="1.73685"
        width="56.1216"
        height="56.1216"
        rx="28.0608"
        stroke="#0F9BFB"
        strokeOpacity="0.1"
        strokeWidth="1.93523"
      />
      <rect
        x="2.70457"
        y="2.70447"
        width="54.1863"
        height="54.1863"
        rx="27.0932"
        fill="url(#paint0_radial_5_190)"
      />
      <g filter="url(#filter0_d_5_190)">
        <path
          d="M29.7977 14.3158C30.031 22.7676 36.8277 29.5642 45.2795 29.7976C36.8277 30.031 30.031 36.8276 29.7977 45.2794C29.5643 36.8276 22.7677 30.031 14.3159 29.7976C22.7677 29.5642 29.5643 22.7676 29.7977 14.3158Z"
          fill="url(#paint1_radial_5_190)"
        />
      </g>
      <defs>
        <filter
          id="filter0_d_5_190"
          x="8.51018"
          y="12.3806"
          width="42.575"
          height="42.575"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="3.87045" />
          <feGaussianBlur stdDeviation="2.90284" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.0038961 0 0 0 0 0.576623 0 0 0 0 0.896104 0 0 0 1 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_5_190"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_5_190"
            result="shape"
          />
        </filter>
        <radialGradient
          id="paint0_radial_5_190"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(29.7977 44.7956) rotate(90) scale(31.9312)"
        >
          <stop stopColor="#058BF7" />
          <stop offset={1} stopColor="#1AADFE" />
        </radialGradient>
        <radialGradient
          id="paint1_radial_5_190"
          cx={0}
          cy={0}
          r={1}
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(29.7977 29.7976) rotate(90) scale(51.9236)"
        >
          <stop stopColor="white" />
          <stop offset={1} stopColor="#A5D6FD" />
        </radialGradient>
      </defs>
    </svg>
  );
};

export const LogoDashboard: React.FC<LogoProps> = ({ className }) => (
  <svg
    width="240"
    height="50"
    viewBox="0 0 240 50"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M41.9844 43.1879V7.36328H48.9884V43.1879H41.9844Z"
      fill="#D6D1FF"
    />
    <path
      d="M66.4114 43.7533C63.7062 43.7533 61.3492 43.1328 59.3537 41.9056C57.3583 40.6783 55.8182 39.0098 54.7334 36.9276C53.6487 34.8455 53.0996 32.5426 53.0996 30.0054C53.0996 27.3717 53.6621 25.0413 54.8004 22.9867C55.9387 20.9321 57.4654 19.3187 59.3939 18.1328C61.3224 16.9469 63.5053 16.354 65.9292 16.354C67.9515 16.354 69.746 16.6849 71.2995 17.333C72.853 17.9949 74.1654 18.9188 75.2502 20.1047C76.3215 21.2906 77.1384 22.6557 77.7009 24.2139C78.2634 25.7721 78.5446 27.4544 78.5446 29.2884C78.5446 29.7986 78.5178 30.3088 78.4777 30.8052C78.4375 31.3016 78.3437 31.7291 78.2232 32.0738H59.1261V26.7787H74.2591L70.9379 29.2746C71.2459 27.8956 71.2325 26.6684 70.8977 25.5928C70.5495 24.5173 69.9603 23.6761 69.1032 23.0418C68.2461 22.4213 67.2015 22.1041 65.956 22.1041C64.7374 22.1041 63.6928 22.4075 62.8223 23.0142C61.9518 23.621 61.2956 24.5173 60.867 25.7031C60.4251 26.889 60.2644 28.3369 60.3581 30.033C60.2376 31.5084 60.3983 32.8046 60.867 33.9216C61.3358 35.0385 62.0455 35.921 63.0098 36.5415C63.974 37.1621 65.1391 37.4792 66.5185 37.4792C67.764 37.4792 68.8353 37.2172 69.7192 36.707C70.6031 36.1968 71.2995 35.4935 71.795 34.5972L77.3929 37.3413C76.8974 38.6237 76.1073 39.7407 75.0359 40.7059C73.9645 41.6712 72.6923 42.4158 71.2325 42.9398C69.746 43.4913 68.1523 43.7533 66.4114 43.7533Z"
      fill="#D6D1FF"
    />
    <path
      d="M90.1691 43.1879L80.125 16.9331H87.6915L94.6554 36.7897H91.7627L98.7266 16.9331H106.293L96.2491 43.1879H90.1691Z"
      fill="#D6D1FF"
    />
    <path
      d="M121.185 43.7533C118.48 43.7533 116.123 43.1328 114.127 41.9056C112.132 40.6783 110.592 39.0098 109.507 36.9276C108.422 34.8455 107.873 32.5426 107.873 30.0054C107.873 27.3717 108.436 25.0413 109.574 22.9867C110.712 20.9321 112.239 19.3187 114.167 18.1328C116.096 16.9469 118.279 16.354 120.703 16.354C122.725 16.354 124.519 16.6849 126.073 17.333C127.626 17.9949 128.939 18.9188 130.024 20.1047C131.095 21.2906 131.912 22.6557 132.474 24.2139C133.037 25.7721 133.318 27.4544 133.318 29.2884C133.318 29.7986 133.291 30.3088 133.251 30.8052C133.211 31.3016 133.117 31.7291 132.997 32.0738H113.899V26.7787H129.033L125.711 29.2746C126.019 27.8956 126.006 26.6684 125.671 25.5928C125.323 24.5173 124.734 23.6761 123.877 23.0418C123.02 22.4213 121.975 22.1041 120.729 22.1041C119.511 22.1041 118.466 22.4075 117.596 23.0142C116.725 23.621 116.069 24.5173 115.64 25.7031C115.199 26.889 115.038 28.3369 115.132 30.033C115.011 31.5084 115.172 32.8046 115.64 33.9216C116.109 35.0385 116.819 35.921 117.783 36.5415C118.747 37.1621 119.913 37.4792 121.292 37.4792C122.537 37.4792 123.609 37.2172 124.493 36.707C125.377 36.1968 126.073 35.4935 126.568 34.5972L132.166 37.3413C131.671 38.6237 130.881 39.7407 129.809 40.7059C128.738 41.6712 127.466 42.4158 126.006 42.9398C124.533 43.4913 122.926 43.7533 121.185 43.7533Z"
      fill="#D6D1FF"
    />
    <path
      d="M137.43 43.1883V16.9335H143.965V23.2352L143.496 22.3251C144.059 20.1188 144.983 18.6158 146.268 17.8298C147.554 17.0438 149.094 16.6577 150.862 16.6577H152.362V22.8905H150.166C148.451 22.8905 147.072 23.4283 146.014 24.5038C144.956 25.5794 144.42 27.0962 144.42 29.0543V43.1883H137.43Z"
      fill="#D6D1FF"
    />
    <path
      d="M169.758 43.7532C168.017 43.7532 166.397 43.4223 164.924 42.7742C163.45 42.1123 162.259 41.1471 161.348 39.8647L162.004 38.3754V43.1879H155.469V7.36328H162.473V21.9248L161.401 20.4769C162.245 19.1669 163.383 18.1465 164.83 17.4295C166.276 16.7124 167.937 16.3539 169.798 16.3539C172.222 16.3539 174.419 16.9606 176.387 18.1879C178.342 19.4013 179.909 21.0423 181.061 23.1107C182.213 25.1791 182.789 27.4957 182.789 30.0605C182.789 32.5977 182.226 34.9005 181.088 36.9827C179.95 39.0649 178.396 40.7196 176.441 41.9331C174.472 43.1465 172.236 43.7532 169.758 43.7532ZM168.914 37.2723C170.227 37.2723 171.379 36.9689 172.37 36.3622C173.361 35.7554 174.151 34.9005 174.7 33.8112C175.262 32.7218 175.544 31.467 175.544 30.0605C175.544 28.654 175.262 27.4129 174.7 26.3374C174.137 25.2618 173.361 24.4206 172.37 23.7863C171.379 23.1658 170.227 22.8487 168.914 22.8487C167.669 22.8487 166.557 23.152 165.58 23.7588C164.602 24.3655 163.839 25.2204 163.29 26.3098C162.741 27.3991 162.473 28.654 162.473 30.0605C162.473 31.467 162.741 32.7218 163.29 33.8112C163.839 34.9005 164.602 35.7554 165.58 36.3622C166.557 36.9689 167.669 37.2723 168.914 37.2723Z"
      fill="#D6D1FF"
    />
    <path
      d="M186.887 14.5751V7.36328H193.891V14.5751H186.887ZM186.887 43.1879V16.9331H193.891V43.1879H186.887Z"
      fill="#D6D1FF"
    />
    <path
      d="M196.971 43.1879V37.424L211.635 20.7803L212.666 23.1797H197.587V16.9331H218.88V22.697L204.591 39.3821L203.56 36.9276H218.92V43.1741H196.971V43.1879Z"
      fill="#D6D1FF"
    />
    <path
      d="M38.5697 38.1549C30.7085 46.2492 17.9592 46.2492 10.098 38.1549C2.23686 30.0606 2.23686 16.9331 10.098 8.83882C14.2764 4.53656 19.8475 2.52332 25.3249 2.78532C17.4905 4.41246 11.5979 11.5277 11.5979 20.0771C11.5979 23.7588 12.6961 27.1648 14.5576 29.9916C14.8388 30.4329 15.1468 30.8603 15.495 31.274C15.562 31.3568 15.629 31.4257 15.6959 31.5084C18.8297 35.3005 23.5169 37.7136 28.7398 37.7136C31.4852 37.7136 34.0699 37.0517 36.3733 35.8659L38.5697 38.1549Z"
      fill="#D6D1FF"
    />
    <path
      d="M36.36 35.8799C34.0566 37.0658 31.4719 37.7276 28.7265 37.7276C23.5036 37.7276 18.8164 35.3145 15.6826 31.5225C15.8165 31.6741 15.9505 31.8258 16.0978 31.9775C20.6511 36.6659 28.0168 36.6659 32.5567 31.9775L36.36 35.8799Z"
      fill="#939598"
    />
    <path
      d="M38.5694 8.82536L32.5563 15.0168C28.0164 10.3422 20.6373 10.3422 16.0974 15.0168C12.1467 19.0846 11.6378 25.3587 14.5573 29.9919C12.6958 27.1651 11.5977 23.7592 11.5977 20.0774C11.5977 11.5419 17.4902 4.41278 25.3246 2.78564C30.1323 3.02006 34.8865 5.04709 38.5694 8.82536Z"
      fill="#D1D3D4"
    />
    <path
      d="M30.1861 24.5035H22.5124C22.0303 24.5035 21.6285 24.1036 21.6285 23.5934C21.6285 23.097 22.0169 22.6833 22.5124 22.6833H30.4137C31.0298 22.6833 31.5387 22.1593 31.5387 21.525C31.5387 21.4423 31.5387 21.3733 31.5119 21.3044C31.4985 21.2217 31.4717 21.1251 31.4315 21.0562C31.2574 20.6563 30.8691 20.3805 30.4137 20.3805H29.0076C28.5254 20.3805 28.1237 19.9806 28.1237 19.4704C28.1237 18.9602 28.512 18.5603 29.0076 18.5603H29.1549C29.945 18.5327 29.7039 18.1604 29.5566 17.9812C28.6995 17.0987 27.6951 16.4781 26.6238 16.092C23.8784 15.0992 20.6911 15.7335 18.5081 17.995C18.4814 18.0225 18.468 18.0363 18.4546 18.0639C18.3206 18.2432 18.1599 18.5603 18.8429 18.5603H21.5883C22.0704 18.5603 22.4722 18.9602 22.4722 19.4704C22.4722 19.9806 22.0838 20.3805 21.5883 20.3805H18.776C17.5707 20.3805 16.4993 21.2492 16.3118 22.4765C16.1913 23.2487 16.1913 24.0209 16.285 24.7931C16.4324 25.9514 17.4234 26.8063 18.5751 26.8063H24.6819C25.164 26.8063 25.5658 27.2062 25.5658 27.7164C25.5658 28.2128 25.1774 28.6265 24.6819 28.6265H19.5929C18.093 28.6265 18.3073 29.1643 18.5885 29.4952C19.7134 30.626 21.0794 31.3292 22.5258 31.6188C23.0615 31.7291 23.423 32.2255 23.3561 32.7771L23.0615 34.9282C22.9945 35.3833 23.5302 35.6453 23.8382 35.3281L27.8023 31.2465L29.5834 29.4125C30.4003 28.5851 30.9896 27.5923 31.378 26.5581C31.4047 26.503 31.4315 26.434 31.4449 26.3651C31.4717 26.2961 31.4851 26.2272 31.4985 26.172C31.8333 24.8207 30.7887 24.5449 30.1861 24.5035ZM24.3069 18.5741H26.0613C26.5434 18.5741 26.9452 18.974 26.9452 19.4842C26.9452 19.9944 26.5568 20.3943 26.0613 20.3943H24.3069C23.8248 20.3943 23.423 19.9944 23.423 19.4842C23.423 18.974 23.8248 18.5741 24.3069 18.5741ZM19.5661 24.5035H17.8117C17.3296 24.5035 16.9279 24.1036 16.9279 23.5934C16.9279 23.097 17.3162 22.6833 17.8117 22.6833H19.5661C20.0482 22.6833 20.45 23.0832 20.45 23.5934C20.45 24.1036 20.0482 24.5035 19.5661 24.5035ZM29.1549 28.6265H27.4005C26.9184 28.6265 26.53 28.2266 26.53 27.7164C26.53 27.22 26.9184 26.8063 27.4005 26.8063H29.1549C29.637 26.8063 30.0387 27.2062 30.0387 27.7164C30.0254 28.2128 29.637 28.6265 29.1549 28.6265Z"
      fill="#D6D1FF"
    />
    <path
      d="M233.786 22.6971V10.3833H235.353V22.6971H233.786Z"
      fill="#D6D1FF"
    />
    <path
      d="M227.987 10.3833H226.125L221.84 22.6971H223.527L227.063 12.2173L229.621 19.8014H229.634L230.598 22.6971H232.272L227.987 10.3833Z"
      fill="#D6D1FF"
    />
  </svg>
);

// Utility function to format timestamp
const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return "Invalid time";
    }

    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    // If less than 24 hours, show time
    if (diffInHours < 24) {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }

    // If more than 24 hours, show date
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return "Invalid time";
  }
};
