/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMediaQuery } from "@uidotdev/usehooks";
import { cn } from "clsx-for-tailwind";
import { NavLink, useLocation, useNavigate } from "react-router";
import {
  IconCall,
  IconCart,
  IconHome,
  IconLogout,
  IconMessage,
  IconOrders,
} from "../../components/icons/logo";

type Props = {
  confirmToCall: (receiver_id: any) => void;
  userInfo: any;
  handleMessageClick: () => void;
  hasNewMessage: boolean;
  handleLogout: () => void;
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const DashboardLeftSidebar = ({
  confirmToCall,
  userInfo,
  handleMessageClick,
  hasNewMessage,
  handleLogout,
  setIsMobileMenuOpen,
}: Props) => {
  const isLargeDevice = useMediaQuery("only screen and (min-width : 993px)");
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      className={cn(
        " fixed bg-sidebar rounded-r-xl shadow-lg flex flex-col items-center justify-center  py-4 md:pt-16 xl:pt-0 pt-0 text-xs font-light z-50",
        isLargeDevice
          ? " top-1/2 transform -translate-y-1/2 left-0 w-22"
          : "fixed bottom-3 right-0 left-0  w-96 sm:w-fit    mx-auto rounded-xl   py-2 px-4 flex gap-2 flex-row h-fit transform-none"
      )}
    >
      {/* Home */}
      <NavLink
        to="/dashboard"
        type="button"
        end
        className={({ isActive }) =>
          cn("w-16 h-16 flex flex-col items-center justify-center", {
            "bg-icon-active-bg rounded-full fill-icon-active": isActive,
          })
        }
      >
        {({ isActive }) => (
          <>
            <IconHome
              selected={isActive}
              activeColor="#3E4F7E"
              inActiveColor="#B2B5BE"
            />
            <p
              className={cn("text-icon-inactive", {
                "text-icon-active": isActive,
              })}
            >
              Home
            </p>
          </>
        )}
      </NavLink>
      {/* Call */}
      <button
        type="button"
        onClick={() =>
          confirmToCall(JSON.parse(userInfo as string).user.owner_id)
        }
        className={cn("w-16 h-16 flex flex-col items-center justify-center", {
          "bg-icon-active-bg rounded-full": false,
        })}
      >
        <IconCall
          selected={false}
          activeColor="#3E4F7E"
          inActiveColor="#B2B5BE"
        />
        <p
          className={cn("text-icon-inactive", {
            "text-icon-active": false,
          })}
        >
          Call
        </p>
      </button>
      {/* Message */}
      <NavLink
        to="/dashboard/message"
        className={({ isActive }) =>
          cn("w-16 h-16 flex flex-col items-center justify-center relative", {
            "bg-icon-active-bg rounded-full": isActive,
          })
        }
        onClick={() => {
          handleMessageClick();
          if (!isLargeDevice) setIsMobileMenuOpen(true);
        }}
      >
        {({ isActive }) => (
          <>
            <IconMessage
              selected={isActive}
              activeColor="#3E4F7E"
              inActiveColor="#B2B5BE"
            />
            <p
              className={cn("text-icon-inactive", {
                "text-icon-active": isActive,
              })}
            >
              Message
            </p>
            {/* Show the green dot if there's a new message */}
            {hasNewMessage && !isActive && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
            )}
          </>
        )}
      </NavLink>
      {/* Cart */}
      <NavLink
        onClick={() => {
          if (!isLargeDevice) setIsMobileMenuOpen(true);
        }}
        to="/dashboard/cart"
        className={({ isActive }) =>
          cn("w-16 h-16 flex flex-col items-center justify-center", {
            "bg-icon-active-bg rounded-full": isActive,
          })
        }
      >
        {({ isActive }) => (
          <>
            <IconCart
              selected={isActive}
              activeColor="#3E4F7E"
              inActiveColor="#B2B5BE"
            />
            <p
              className={cn("text-icon-inactive", {
                "text-icon-active": isActive,
              })}
            >
              Cart
            </p>
          </>
        )}
      </NavLink>
      {/* Orders */}
      <button
        onClick={() => {
          if (!isLargeDevice) setIsMobileMenuOpen(true);
          navigate("/dashboard/orders");
        }}
        className={cn("w-16 h-16 flex flex-col items-center justify-center", {
          "bg-icon-active-bg rounded-full": location.pathname.includes("/dashboard/orders"),
        })}
      >
        <IconOrders
          selected={location.pathname.includes("/dashboard/orders")}
          activeColor="#3E4F7E"
          inActiveColor="#B2B5BE"
        />
        <p
          className={cn("text-icon-inactive", {
            "text-icon-active": location.pathname.includes("/dashboard/orders"),
          })}
        >
          Orders
        </p>
      </button>
      {/* Logout */}
      <button
        type="button"
        className={cn("w-16 h-16 flex flex-col items-center justify-center", {
          "bg-icon-active-bg rounded-full": false,
        })}
        onClick={handleLogout}
      >
        <IconLogout
          selected={false}
          activeColor="#3E4F7E"
          inActiveColor="#B2B5BE"
        />
        <p
          className={cn("text-icon-inactive", {
            "text-icon-active": false,
          })}
        >
          Logout
        </p>
      </button>
    </nav>
  );
};
