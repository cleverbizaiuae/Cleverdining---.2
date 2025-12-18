import { Link, NavLink, useNavigate } from "react-router";
import {
  IconDevice,
  IconFaq,
  IconHome,
  IconLogout,
  IconManagement,
  IconMessage,
  IconOrderList,
  IconPrivacy,
  IconReservations,
  IconReviews,
} from "./icons";
import { Wallet } from "lucide-react";
import { cn } from "clsx-for-tailwind";
import { CgMenu } from "react-icons/cg";
import { LogoDashboard } from "./utilities";
import { useContext } from "react";
import { WebSocketContext } from "@/hooks/WebSocketProvider";

type SidebarProps = {
  onToggleSidebar: () => void;
  isOpen: boolean;
  home: string;
};

export const StaffSidebar: React.FC<SidebarProps> = ({
  onToggleSidebar: toggleSidebar,
  isOpen: isDrawerOpen,
  home,
}) => {
  const { unreadCount } = useContext(WebSocketContext) || {};

  const menuItems = [
    { title: "Dashboard", icon: <IconHome />, path: "/staff" },
    {
      title: "Reservations",
      icon: <IconReservations />,
      path: "/staff/reservations",
    },
    { title: "Order List", icon: <IconOrderList />, path: "/staff/orders" },
    { title: "Messages", icon: <IconMessage />, path: "/staff/messages" },
  ];
  const navigate = useNavigate();
  const signout = () => {
    navigate("/");
  };

  const SidebarContent = () => (
    <div className="bg-sidebar shadow-lg shadow-black/70 flex flex-col h-full justify-between">
      <div className="py-6 px-4">
        <div className="px-4 mb-8">
          <Link to={home}>
            <LogoDashboard className="w-30" />
          </Link>
        </div>
        <nav>
          <ul>
            {menuItems.map((item, index) => (
              <li key={index}>
                <NavLink
                  to={item.path}
                  end={true}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-4 px-6 py-3 rounded-lg text-gray-300 hover:bg-chat-sender/30 hover:text-white transition-colors relative",
                      {
                        "bg-dashboard": isActive,
                      }
                    )
                  }
                >
                  {item.icon}
                  <span>{item.title}</span>
                  {item.title === "Messages" && unreadCount > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="bg-table-header px-10 py-4">
        <button
          className="flex items-center gap-4 text-gray-300 hover:text-white transition-colors"
          onClick={() => signout()}
        >
          <IconLogout className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {/* Hamburger menu button - only visible on smaller screens */}
      {!isDrawerOpen ? (
        <button
          onClick={toggleSidebar}
          className="lg:hidden fixed top-6 left-4 z-30 bg-gray-800 p-2 rounded-md text-white"
        >
          <CgMenu />
        </button>
      ) : null}

      {/* Mobile sidebar with overlay */}
      <div
        className={`fixed inset-0 bg-black/20 bg-opacity-50 z-20 transition-opacity duration-300 lg:hidden ${isDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        onClick={toggleSidebar}
      />

      {/* Sidebar container */}
      <div
        className={`fixed top-0 left-0 h-full bg-gray-900 text-white z-20 w-64 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"
          } lg:relative lg:z-10`}
      >
        <SidebarContent />
      </div>
    </div>
  );
};
/* Chef Sidebar ===========================================================>>>>> */

export const ChefSidebar: React.FC<SidebarProps> = ({
  onToggleSidebar: toggleSidebar,
  isOpen: isDrawerOpen,
  home,
}) => {
  const { response, unreadCount } = useContext(WebSocketContext) || {};
  console.log(response);
  const menuItems = [
    { title: "Dashboard", icon: <IconHome />, path: "/chef" },
    { title: "Order List", icon: <IconOrderList />, path: "/chef/orders" },
    { title: "Messages", icon: <IconMessage />, path: "/chef/messages" },
  ];

  const navigate = useNavigate();
  const signout = () => {
    navigate("/");
  };

  const SidebarContent = () => (
    <div className="bg-sidebar shadow-lg shadow-black/70 flex flex-col h-full justify-between">
      <div className="py-6 px-4">
        <div className="px-4 mb-8">
          <Link to={home}>
            <LogoDashboard className="w-30" />
          </Link>
        </div>
        <nav>
          <ul>
            {menuItems.map((item, index) => (
              <li key={index}>
                <NavLink
                  to={item.path}
                  end={true}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-4 px-6 py-3 rounded-lg text-gray-300 hover:bg-chat-sender/30 hover:text-white transition-colors",
                      {
                        "bg-dashboard": isActive,
                      }
                    )
                  }
                >
                  {item.icon}
                  <span>{item.title}</span>
                  {item.title === "Messages" && unreadCount > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="bg-table-header px-10 py-4">
        <button
          className="flex items-center gap-4 text-gray-300 hover:text-white transition-colors"
          onClick={() => signout()}
        >
          <IconLogout className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {/* Hamburger menu button - only visible on smaller screens */}
      {!isDrawerOpen ? (
        <button
          onClick={toggleSidebar}
          className="lg:hidden fixed top-6 left-4 z-30 bg-gray-800 p-2 rounded-md text-white"
        >
          <CgMenu />
        </button>
      ) : null}

      {/* Mobile sidebar with overlay */}
      <div
        className={`fixed inset-0 bg-black/20 bg-opacity-50 z-20 transition-opacity duration-300 lg:hidden ${isDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        onClick={toggleSidebar}
      />

      {/* Sidebar container */}
      <div
        className={`fixed top-0 left-0 h-full bg-gray-900 text-white z-20 w-64 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"
          } lg:relative lg:z-10`}
      >
        <SidebarContent />
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Chef Sidebar */

/* Admin Sidebar ===========================================================>>>>> */
export const AdminSidebar: React.FC<SidebarProps> = ({
  onToggleSidebar: toggleSidebar,
  isOpen: isDrawerOpen,
}) => {
  const menuItems = [
    { title: "Dashboard", icon: <IconHome />, path: "/admin" },
    {
      title: "Management",
      icon: <IconManagement />,
      path: "/admin/management",
    },
    { title: "Privacy", icon: <IconPrivacy />, path: "/admin/privacy-policy" },
    {
      title: "Terms & Condition",
      icon: <IconOrderList />,
      path: "/admin/terms-condition",
    },
    { title: "FAQ's", icon: <IconFaq />, path: "/admin/faq" },
  ];
  const navigate = useNavigate();
  const signout = () => {
    navigate("/");
  };

  const SidebarContent = () => (
    <div className="bg-sidebar shadow-lg shadow-black/70 flex flex-col h-full justify-between">
      <div className="py-6 px-4">
        <div className="px-4 mb-8">
          <LogoDashboard className="w-30" />
        </div>
        <nav>
          <ul>
            {menuItems.map((item, index) => (
              <li key={index}>
                <NavLink
                  to={item.path}
                  end={true}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-4 px-6 py-3 rounded-lg text-gray-300 hover:bg-chat-sender/30 hover:text-white transition-colors",
                      {
                        "bg-dashboard": isActive,
                      }
                    )
                  }
                >
                  {item.icon}
                  <span>{item.title}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="bg-table-header px-10 py-4">
        <button
          className="flex items-center gap-4 text-gray-300 hover:text-white transition-colors"
          onClick={() => signout()}
        >
          <IconLogout className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {/* Hamburger menu button - only visible on smaller screens */}
      {!isDrawerOpen ? (
        <button
          onClick={toggleSidebar}
          className="lg:hidden fixed top-6 left-4 z-30 bg-gray-800 p-2 rounded-md text-white"
        >
          <CgMenu />
        </button>
      ) : null}

      {/* Mobile sidebar with overlay */}
      <div
        className={`fixed inset-0 bg-black/20 bg-opacity-50 z-20 transition-opacity duration-300 lg:hidden ${isDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        onClick={toggleSidebar}
      />

      {/* Sidebar container */}
      <div
        className={`fixed top-0 left-0 h-full bg-gray-900 text-white z-20 w-64 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"
          } lg:relative lg:z-10`}
      >
        <SidebarContent />
      </div>
    </div>
  );
};
/* <<<<<<<<===================================================== Chef Sidebar */

/* Admin Sidebar ===========================================================>>>>> */
export const RestaurantSidebar: React.FC<SidebarProps> = ({
  onToggleSidebar: toggleSidebar,
  isOpen: isDrawerOpen,
  home,
}) => {
  const { unreadCount } = useContext(WebSocketContext) || {};

  const menuItems = [
    { title: "Dashboard", icon: <IconHome />, path: "/restaurant" },
    {
      title: "OrderList",
      icon: <IconOrderList />,
      path: "/restaurant/orders",
    },
    {
      title: "Reservation",
      icon: <IconReservations />,
      path: "/restaurant/reservations",
    },
    { title: "Messages", icon: <IconMessage />, path: "/restaurant/messages" },
    {
      title: "Management",
      icon: <IconManagement />,
      path: "/restaurant/management",
    },
    { title: "Tables", icon: <IconDevice />, path: "/restaurant/devices" },
    { title: "Payments", icon: <Wallet className="w-5 h-5" />, path: "/restaurant/payments" },
    { title: "Reviews", icon: <IconReviews />, path: "/restaurant/reviews" },
  ];
  const navigate = useNavigate();

  const signout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userInfo");
    navigate("/");
  };

  const SidebarContent = () => (
    <div className="bg-sidebar shadow-lg shadow-black/70 flex flex-col h-full justify-between">
      <div className="py-6 px-4">
        <div className="px-4 mb-8">
          <Link to={home}>
            <LogoDashboard className="w-30" />
          </Link>
        </div>
        <nav>
          <ul>
            {menuItems.map((item, index) => (
              <li key={index}>
                <NavLink
                  to={item.path}
                  end={true}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-4 px-6 py-3 rounded-lg text-gray-300 hover:bg-chat-sender/30 hover:text-white transition-colors relative",
                      {
                        "bg-dashboard": isActive,
                      }
                    )
                  }
                >
                  {item.icon}
                  <span>{item.title}</span>
                  {item.title === "Messages" && unreadCount > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="bg-table-header px-10 py-4">
        <button
          className="flex items-center gap-4 text-gray-300 hover:text-white transition-colors"
          onClick={() => signout()}
        >
          <IconLogout className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {/* Hamburger menu button - only visible on smaller screens */}
      {!isDrawerOpen ? (
        <button
          onClick={toggleSidebar}
          className="lg:hidden fixed top-6 left-4 z-30 bg-gray-800 p-2 rounded-md text-white"
        >
          <CgMenu />
        </button>
      ) : null}

      {/* Mobile sidebar with overlay */}
      <div
        className={`fixed inset-0 bg-black/20 bg-opacity-50 z-20 transition-opacity duration-300 lg:hidden ${isDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        onClick={toggleSidebar}
      />

      {/* Sidebar container */}
      <div
        className={`fixed top-0 left-0 h-full bg-gray-900 text-white z-20 w-64 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"
          } lg:relative lg:z-10`}
      >
        <SidebarContent />
      </div>
    </div>
  );
};
