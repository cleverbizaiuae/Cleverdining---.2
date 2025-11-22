/* eslint-disable @typescript-eslint/no-explicit-any */
import { IconCustomerInfo } from "../../components/icons";
import { ButtonStatus, TextSearchBox } from "../../components/input";
import { ModalAddSubscriber } from "../../components/modals";
import { StatCardAsteric, Pagination } from "../../components/utilities";
import { IoMdAdd } from "react-icons/io";
import { useSelector } from "react-redux";
import {
  hideSubscriberDetail,
  showSubscriberDetail,
} from "./redux-slices/slice_admin_management";
import React, { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../store/store";
import axiosInstance from "@/lib/axios";

export interface TSubscriber {
  id: number;
  resturent_name: string;
  location: string;
  phone_number: string;
  image: string;
  owner: number;
  package: string | null;
  subscriptions: any[];
  created_at: string;
  updated_at: string;
  status?: "Active" | "Hold" | "Inactive" | string;
}
export interface Subscriber {
  name: string;
  customerId: string;
  cellNumber: string;
  startingDate: string;
  package: "Monthly" | "Half yearly" | "Yearly" | string;
  status: "Active" | "Hold" | "Inactive" | string;
}
export const subscribers: Subscriber[] = [
  {
    name: "Kicker Nicil",
    customerId: "55-1234",
    cellNumber: "(555) 555-1234",
    startingDate: "12 July 2024",
    package: "Half yearly",
    status: "Active",
  },
  {
    name: "Kicker Nicil",
    customerId: "55-1234",
    cellNumber: "(555) 555-1234",
    startingDate: "12 July 2024",
    package: "Yearly",
    status: "Active",
  },
  {
    name: "Kicker Nicil",
    customerId: "55-1234",
    cellNumber: "(555) 555-1234",
    startingDate: "12 July 2024",
    package: "Monthly",
    status: "Hold",
  },
  {
    name: "Kicker Nicil",
    customerId: "55-1234",
    cellNumber: "(555) 555-1234",
    startingDate: "12 July 2024",
    package: "Monthly",
    status: "Active",
  },
];

const ScreenAdminManagement = () => {
  type DashboardStats = {
    total_restaurant: number;
    total_hold_restaurant: number;
    total_active_restaurant: number;
  };
  const [allResutrentUser, setallResutrentUser] = useState<TSubscriber[]>([]);
  const [search, setSearch] = useState("");
  //
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(1); // current page (1-based)
  const [total, setTotal] = useState(0); // total items from API (DRF `count`)
  const [loading, setLoading] = useState(false);
  //
  console.log(search, "search");
  const [stats, setStats] = useState<DashboardStats>({
    total_restaurant: 0,
    total_hold_restaurant: 0,
    total_active_restaurant: 0,
  });
  useEffect(() => {
    const fetchDatas = async () => {
      const res = await axiosInstance.get("/adminapi/restaurants/summary/");
      const data = await res?.data;
      setStats(data);
    };
    fetchDatas();
  }, []);
  //
  useEffect(() => {
    setPage(1);
  }, [search]);
  //
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const params: Record<string, any> = {
          page, // ?page=1,2,3...
          page_size: PAGE_SIZE, // ?page_size=5
        };
        if (search.trim()) params.restaurant_name = search.trim();

        const response = await axiosInstance.get("/adminapi/restaurants/", {
          params,
        });

        // DRF style: { count, results, next, previous }
        const { count = 0, results = [] } = response.data ?? {};
        setallResutrentUser(Array.isArray(results) ? results : []);
        setTotal(count);

        // clamp page if it went out of range (e.g., after narrowing search)
        const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
        if (page > totalPages) setPage(totalPages);
      } catch (error) {
        console.error("Error fetching subscribers", error);
        setallResutrentUser([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [search, page]);

  const dispatch = useAppDispatch();

  const showAddSubscriberModal = () => {
    dispatch(showSubscriberDetail(undefined));
  };
  return (
    <>
      <div className="flex flex-col">
        {/* Dashboard Cards */}
        <div className="flex flex-col lg:flex-row gap-y-3 lg:gap-y-0 lg:gap-x-3">
          {/* Card 1 */}
          <StatCardAsteric
            label="Total Restaurant"
            data={stats.total_restaurant.toString()}
            accentColor="#FFB056"
            gradientStart="#48E03A"
            gradientEnd="#161F42"
          />
          {/* Card 2 */}
          <StatCardAsteric
            label="Total On Hold"
            data={stats.total_hold_restaurant.toString()}
            accentColor="#FF6561"
            gradientStart="#FFB056"
            gradientEnd="#161F42"
          />
          {/* Card 3 */}
          <StatCardAsteric
            accentColor="#31BB24"
            label="Active Today"
            data={stats.total_active_restaurant.toString()}
            gradientStart="#EB342E"
            gradientEnd="#161F42"
          />
        </div>
        {/* Dashboard Content */}
        {/* Header and dropdown */}
        <div className="flex flex-row justify-between items-center my-3">
          <h2 className="text-2xl text-primary-text">Subscriber management</h2>
          <div className="flex flex-row justify-end items-center gap-x-4">
            {/* <button
              onClick={() => showAddSubscriberModal()}
              className="button-primary bg-sidebar text-nowrap flex flex-row justify-center items-center h-14 gap-x-2"
            >
              <IoMdAdd />
              <span>Add Subscriber</span>
            </button> */}
            <TextSearchBox
              placeholder="Search subscriber"
              value={search}
              onChange={setSearch}
            />
          </div>
        </div>
        {/* List of content */}
        <div className="bg-sidebar p-4 rounded-lg">
          <TableSubscriberList subscribers={allResutrentUser} query={search} />
          <div className="mt-4 flex justify-center">
            <Pagination
              page={page}
              total={total} // DRF `count`
              pageSize={PAGE_SIZE} // make sure your Pagination uses this
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>
    </>
  );
};
interface TableSubscriberListProps {
  subscribers: TSubscriber[];
  query?: string;
}
export const TableSubscriberList: React.FC<TableSubscriberListProps> = ({
  subscribers,
  query = "",
}) => {
  console.log(subscribers, "subscribers");
  type DashboardStats = {
    total_restaurant: number;
    total_hold_restaurant: number;
    total_active_restaurant: number;
  };

  const [rows, setRows] = useState(subscribers);
  useEffect(() => setRows(subscribers), [subscribers]);

  const [resUserId, setResUserId] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<DashboardStats>({
    total_restaurant: 0,
    total_hold_restaurant: 0,
    total_active_restaurant: 0,
  });
  const [savingSet, setSavingSet] = useState<Set<string | number>>(new Set());

  const dispatch = useAppDispatch();
  const openShowDetailModal = useAppSelector(
    (state) => state.adminManagement.modals.showDetail
  );

  const refreshSummary = useCallback(async () => {
    try {
      const { data } = await axiosInstance.get(
        "/adminapi/restaurants/summary/"
      );
      setStats(data);
    } catch (e) {
      console.error("Failed to refresh summary:", e);
    }
  }, []);
  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  const getDisplayStatus = (item: any) =>
    (item?.subscriptions?.length ?? 0) === 0
      ? "Hold"
      : item?.status ?? "Active";

  // ✅ uses /adminapi/update-status/<int:restaurant_id>/ (PATCH)
  const updateSubscriberStatus = async (
    restaurantId: string | number,
    status: string
  ) => {
    const { data } = await axiosInstance.patch(
      `/adminapi/update-status/${restaurantId}/`,
      { status } // use .toLowerCase() if your API expects lowercase
    );
    return data;
  };

  const handleStatusChange = async (item: any, next: string) => {
    const prev = getDisplayStatus(item);
    if (next === prev) return;

    setSavingSet((s) => new Set(s).add(item.id));
    setRows((list) =>
      list.map((r) => (r.id === item.id ? { ...r, status: next } : r))
    );

    try {
      const saved = await updateSubscriberStatus(item.id, next);
      // If API returns canonical status, sync (optional)
      if (saved?.status && saved.status !== next) {
        setRows((list) =>
          list.map((r) =>
            r.id === item.id ? { ...r, status: saved.status } : r
          )
        );
      }
      await refreshSummary();
    } catch (e) {
      setRows((list) =>
        list.map((r) => (r.id === item.id ? { ...r, status: prev } : r))
      );
    } finally {
      setSavingSet((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  };

  const showAddSubscriberModal = (id: string) => {
    setResUserId(id);
    dispatch(showSubscriberDetail(undefined));
  };
  const hideAddSubscriberModal = () => dispatch(hideSubscriberDetail());

  return (
    <>
      <table className="w-full table-auto text-left clever-table">
        <thead className="table-header rounded-lg overflow-hidden text-primary-text text-sm font-normal">
          <tr>
            <th>Resturant</th>
            <th>Customer ID</th>
            <th>Cell No.</th>
            <th>Starting Date</th>
            <th>Package</th>
            <th>Customer Info</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody className="bg-sidebar text-sm">
          {rows.map((item, index) => (
            <tr key={index} className="border-b border-[#1C1E3C]">
              <td className="p-4 text-primary-text">{item?.resturent_name}</td>
              <td className="p-4 text-primary-text">{item?.id}</td>
              <td className="p-4 text-primary-text">{item?.phone_number}</td>
              <td className="p-4 text-primary-text">
                {item?.created_at?.slice?.(0, 10)}
              </td>
              <td className="p-4 text-primary-text">
                {item?.package || "N/A"}
              </td>

              <td className="h-20 p-4 flex gap-x-4 items-center">
                <button
                  onClick={() => showAddSubscriberModal(item?.id?.toString())}
                  className="text-blue-100 bg-table-header flex flex-row items-center gap-x-2 p-3"
                >
                  <IconCustomerInfo />
                  <span>View</span>
                </button>
              </td>

              <td className="p-4">
                {item.package ? (
                  <ButtonStatus
                    availableStatuses={["Active", "Hold"]}
                    status={getDisplayStatus(item)}
                    properties={{
                      Active: { bg: "bg-green-800", text: "text-green-300" },
                      Hold: { bg: "bg-red-800", text: "text-red-300" },
                      Pending: { bg: "bg-yellow-800", text: "text-yellow-300" },
                      "Delete Request": {
                        bg: "bg-red-900",
                        text: "text-red-300",
                      },
                    }}
                    disabled={savingSet.has(item.id)}
                    onChange={(next) => handleStatusChange(item, next)}
                  />
                ) : (
                  <span className="px-3 py-1 text-sm rounded-full bg-gray-800 text-gray-300 border border-gray-700 shadow-sm">
                    No subscription
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ModalAddSubscriber
        id={resUserId ? Number(resUserId) : undefined}
        isOpen={openShowDetailModal}
        close={hideAddSubscriberModal}
      />
    </>
  );
};
export default ScreenAdminManagement;
