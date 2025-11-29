import { EditDeviceModal } from "@/components/modals";
import { TableDeviceList } from "@/components/tables";
import { useOwner } from "@/context/ownerContext";
import { useEffect, useState } from "react";
import { ButtonAdd, TextSearchBox } from "../../components/input";
import {
  DashboardCard,
  Pagination
} from "../../components/utilities";

export const ScreenRestaurantDevices = () => {
  const {
    allDevices,
    devicesCount,
    devicesCurrentPage,
    devicesSearchQuery,
    deviceStats,
    fetchAllDevices,
    fetchDeviceStats,
    setDevicesCurrentPage,
    setDevicesSearchQuery,
  } = useOwner();

  const [deviceModal, setShowAddModall] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchDeviceStats(), fetchAllDevices()]);
      } catch (error) {
        console.error("Failed to load device data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchDeviceStats, fetchAllDevices]);

  const handlePageChange = (page: number) => {
    setDevicesCurrentPage(page);
    fetchAllDevices(page, devicesSearchQuery);
  };

  const handleSearchChange = (query: string) => {
    setDevicesSearchQuery(query);
    fetchAllDevices(1, query);
  };

  const showDeviceModal = () => {
    setShowAddModall(true);
  };

  const closeDeviceModal = () => {
    setShowAddModall(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading devices...</div>
      </div>
    );
  }
  const user = localStorage.getItem("userInfo");
  const parseUser = user ? JSON.parse(user) : null;
  console.log(parseUser, "user info in device page");
  const userRole = parseUser?.role;

  // useEffect(() => {
  //   const fetchAllDevices = useCallback(
  //     async (page: number = devicesCurrentPage, search?: string) => {
  //       // Don't fetch if still loading or if userRole is null
  //       if (isLoading || !userRole) {
  //         return;
  //       }

  //       try {
  //         const searchParam = search || devicesSearchQuery;
  //         const endpoint =
  //           userRole === "owner"
  //             ? `/owners/devices/?page=${page}&search=${searchParam}`
  //             : `/staff/devices/?page=${page}&search=${searchParam}`;

  //         const response = await axiosInstance.get(endpoint);
  //         console.log(response, "response");
  //         const devices = Array.isArray(response.data?.results)
  //           ? response.data?.results
  //           : [];
  //         setAllDevices(devices);
  //       } catch (error) {
  //         console.error("Failed to load devices", error);
  //         toast.error("Failed to load devices.");
  //       }
  //     },
  //     [devicesCurrentPage, devicesSearchQuery, userRole, isLoading]
  //   );
  //   fetchAllDevices();
  // }, []);

  return (
    <>
      <div className="flex flex-col">
        {/* Stats Cards */}
        <div className="flex flex-col lg:flex-row gap-y-3 lg:gap-y-0 lg:gap-x-3">
          <DashboardCard
            label="Total tables"
            data={deviceStats?.total_devices?.toString() || "0"}
            accentColor="#31BB24"
            gradientStart="#48E03A"
            gradientEnd="#161F42"
          />
          <DashboardCard
            label="Active tables"
            data={deviceStats?.active_devices?.toString() || "0"}
            accentColor="#4F46E5"
            gradientStart="#4F46E5"
            gradientEnd="#161F42"
          />
          <DashboardCard
            label="Hold tables"
            data={deviceStats?.hold_devices?.toString() || "0"}
            accentColor="#FFB056"
            gradientStart="#FFB056"
            gradientEnd="#161F42"
          />
        </div>

        {/* Header and search */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-y-2 md:gap-y-0 my-4">
          <h2 className="flex-1 text-2xl text-primary-text">
            Registered Table List
          </h2>
          <div className="flex-1 flex gap-x-4 justify-end">
            <ButtonAdd label="Add Table" onClick={() => showDeviceModal()} />
            <TextSearchBox
              placeholder="Search by table name"
              value={devicesSearchQuery}
              onChange={handleSearchChange}
            />
          </div>
        </div>

        {/* List of content */}
        <div className="bg-sidebar p-4 rounded-lg">
          <TableDeviceList data={allDevices} />
          <div className="mt-4 flex justify-center">
            <Pagination
              page={devicesCurrentPage}
              total={devicesCount}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>
      <EditDeviceModal isOpen={deviceModal} close={closeDeviceModal} />
    </>
  );
};
