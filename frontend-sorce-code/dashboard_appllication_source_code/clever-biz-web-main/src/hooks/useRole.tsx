import { useState, useEffect } from "react";
import axiosInstance from "@/lib/axios";
import type { NavigateFunction } from "react-router";

export type UserRole =
  | "chef"
  | "staff"
  | "owner"
  | "admin"
  | "customer"
  | "manager"
  | null;

interface UserInfo {
  id: number;
  email: string;
  role: UserRole;
  username?: string;
  restaurants?: any[];
  owner_id?: number | null;
  restaurants_id?: number | null;
  device_id?: number | null;
  subscription?: Record<string, unknown> | null;
  image?: string | null;
  // Add other user properties as needed
}

const isBrowser = typeof window !== "undefined";

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const roleDashboardMap: Record<Exclude<UserRole, null>, string> = {
  admin: "/admin",
  owner: "/restaurant",
  manager: "/restaurant", // Manager shares Owner Dashboard
  chef: "/chef",
  staff: "/staff",
  customer: "/",
};

export const useRole = () => {
  const initialUser = isBrowser
    ? safeParse<UserInfo | null>(localStorage.getItem("userInfo"), null)
    : null;
  const [userInfo, setUserInfo] = useState<UserInfo | null>(() => initialUser);
  const [userRole, setUserRole] = useState<UserRole>(
    () => initialUser?.role || null
  );
  const [isLoading, setIsLoading] = useState(true);
  // Get user role from localStorage
  const getUserRole = (): UserRole => {
    try {
      const userInfoStr = localStorage.getItem("userInfo");
      if (userInfoStr) {
        const user = JSON.parse(userInfoStr);
        return user.role || null;
      }
    } catch (error) {
      console.error("Error parsing user info:", error);
    }
    return null;
  };

  // Get full user info from localStorage
  const getUserInfo = (): UserInfo | null => {
    try {
      const userInfoStr = localStorage.getItem("userInfo");
      if (userInfoStr) {
        return JSON.parse(userInfoStr);
      }
    } catch (error) {
      console.error("Error parsing user info:", error);
    }
    return null;
  };

  // Check if user has specific role
  const hasRole = (role: UserRole): boolean => {
    return userRole === role;
  };

  // Check if user has any of the specified roles
  const hasAnyRole = (roles: UserRole[]): boolean => {
    return roles.includes(userRole as UserRole);
  };

  // Check if user is authenticated
  const isAuthenticated = (): boolean => {
    return userRole !== null && !!localStorage.getItem("accessToken");
  };

  // Clear user data (for logout)
  const clearUserData = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userInfo");
    setUserRole(null);
    setUserInfo(null);
  };

  // Update user data (for login)
  const updateUserData = (
    user: UserInfo,
    accessToken: string,
    refreshToken: string
  ) => {
    console.log(user, "updating user data in useRole");
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("userInfo", JSON.stringify(user));
    setUserRole(user?.role);
    setUserInfo(user);
  };

  // Initialize user data on component mount
  useEffect(() => {
    let isMounted = true;

    const bootstrapUser = async () => {
      const role = getUserRole();
      const user = getUserInfo();

      if (isMounted) {
        setUserRole(role);
        setUserInfo(user);
      }

      const hasToken =
        isBrowser && typeof localStorage !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;

      if (hasToken) {
        try {
          const response = await axiosInstance.get<UserInfo>("/profile/");
          if (isMounted && response?.data) {
            const profile = response.data;
            localStorage.setItem("userInfo", JSON.stringify(profile));
            setUserInfo(profile);
            setUserRole(profile?.role || null);
          }
        } catch (error) {
          console.error("Failed to load profile information:", error);
        }
      }

      if (isMounted) {
        setIsLoading(false);
      }
    };

    bootstrapUser();

    return () => {
      isMounted = false;
    };
  }, []);


  const getDashboardPath = (roleOverride?: UserRole | null) => {
    if (!roleOverride) return "/";
    return roleDashboardMap[roleOverride] ?? "/";
  };

  const redirectToDashboard = (
    navigateFn: NavigateFunction,
    roleOverride?: UserRole | null,
    options?: { replace?: boolean }
  ) => {
    const targetRole = roleOverride ?? userRole;
    const targetPath = getDashboardPath(targetRole);
    navigateFn(targetPath, { replace: options?.replace ?? false });
  };

  return {
    userRole,
    userInfo,
    isLoading,
    getUserRole,
    getUserInfo,
    hasRole,
    hasAnyRole,
    isAuthenticated,
    clearUserData,
    updateUserData,
    getDashboardPath,
    redirectToDashboard,
  };
};

// import { useState, useEffect } from "react";

// export type UserRole = "chef" | "staff" | "owner" | "admin" | null;

// interface UserInfo {
//   id: number;
//   email: string;
//   role: UserRole;
//   username?: string;
//   restaurants?: any[];
// }

// const isBrowser = typeof window !== "undefined";

// const safeParse = <T,>(raw: string | null, fallback: T): T => {
//   if (!raw) return fallback;
//   try {
//     return JSON.parse(raw) as T;
//   } catch {
//     return fallback;
//   }
// };

// export const useRole = () => {
//   const initialUser: UserInfo | null = isBrowser
//     ? safeParse<UserInfo | null>(localStorage.getItem("userInfo"), null)
//     : null;

//   const [userInfo, setUserInfo] = useState<UserInfo | null>(initialUser);
//   const [userRole, setUserRole] = useState<UserRole>(initialUser?.role ?? null);
//   const [isLoading, setIsLoading] = useState(false);

//   // ✅ Update user data instantly
//   const updateUserData = (
//     user: UserInfo,
//     accessToken: string,
//     refreshToken: string
//   ) => {
//     localStorage.setItem("accessToken", accessToken);
//     localStorage.setItem("refreshToken", refreshToken);
//     localStorage.setItem("userInfo", JSON.stringify(user));

//     // 🔥 Trigger state update immediately
//     setUserInfo(user);
//     setUserRole(user.role);
//   };

//   // ✅ Clear user data
//   const clearUserData = () => {
//     localStorage.removeItem("accessToken");
//     localStorage.removeItem("refreshToken");
//     localStorage.removeItem("userInfo");
//     setUserRole(null);
//     setUserInfo(null);
//   };

//   // ✅ Sync across tabs / reload-free updates
//   useEffect(() => {
//     const handleStorage = () => {
//       const user = safeParse<UserInfo | null>(
//         localStorage.getItem("userInfo"),
//         null
//       );
//       setUserInfo(user);
//       setUserRole(user?.role ?? null);
//     };

//     window.addEventListener("storage", handleStorage);
//     return () => window.removeEventListener("storage", handleStorage);
//   }, []);
// console.log(userRole, "user role in useRole");
//   return {
//     userRole,
//     userInfo,
//     isLoading,
//     updateUserData,
//     clearUserData,
//     isAuthenticated: () =>
//       userRole !== null && !!localStorage.getItem("accessToken"),
//   };
// };
