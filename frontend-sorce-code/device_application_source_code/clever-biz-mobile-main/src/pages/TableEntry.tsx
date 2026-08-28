import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axiosInstance from "../lib/axios";
import { ImSpinner6 } from "react-icons/im";
import { getRegionConfig } from "../config/regionConfig";
import { clearGuestSessionStorage } from "../lib/guestSessionStorage";
import { getCustomerErrorMessage } from "../lib/customerErrorMessage";

const TableEntry = () => {
    const { uuid } = useParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDeviceAndLogin = async () => {
            if (!uuid) return;

            try {
                const previousSessionToken = localStorage.getItem("guest_session_token");
                // 1. Fetch device details by UUID
                const response = await axiosInstance.get(`/api/customer/devices/${uuid}/`);
                const device = response.data;

                // Check Device Status (Respect Dashboard Configuration)
                if (device.action && device.action.toLowerCase() !== 'active') {
                    throw new Error(`Table is currently ${device.action}. Please contact staff.`);
                }

                // 2. Resolve Table Session (Get Real Token)
                const sessionRes = await axiosInstance.post('/api/customer/resolve-table/', {
                    device_id: device.id // Use ID from details
                });

                const {
                    guest_session_id,
                    session_token,
                    restaurant_region,
                    restaurant_currency,
                    restaurant_timezone,
                    restaurant_country_code,
                    default_payment_provider
                } = sessionRes.data;
                const resolvedRegion =
                    String(restaurant_region || "UAE").toUpperCase() === "UK" ? "UK" : "UAE";
                const regionSettings = getRegionConfig(resolvedRegion);

                // 3. Create guest user info
                const mockUserInfo = {
                    user: {
                        username: device.table_name || `Table ${device.table_number}`,
                        email: `${device.uuid}@guest.com`,
                        restaurants: [
                            {
                                id: device.restaurant_id,
                                table_name: device.table_name,
                                device_id: device.id,
                                guest_session_id,
                                resturent_name: device.restaurant_name,
                                region: restaurant_region || resolvedRegion,
                                currency: restaurant_currency || regionSettings.currency,
                                timezone: restaurant_timezone || regionSettings.timezone,
                                country_code: restaurant_country_code || regionSettings.countryCode,
                                default_payment_provider:
                                    default_payment_provider || regionSettings.defaultPaymentProvider,
                            },
                        ],
                    },
                    role: "guest",
                };

                // 4. Store session & info. A resumed scan keeps the current
                // guest's state; a new session starts with no previous table data.
                if (previousSessionToken !== session_token) {
                    clearGuestSessionStorage();
                }

                localStorage.setItem("userInfo", JSON.stringify(mockUserInfo));
                localStorage.removeItem("accessToken");
                localStorage.setItem("guest_session_token", session_token); // CRITICAL for backend auth
                localStorage.setItem("guest_session_id", String(guest_session_id || ""));
                localStorage.setItem("restaurant_id", String(device.restaurant_id || ""));
                localStorage.setItem("device_id", String(device.id || ""));
                localStorage.setItem("table_name", device.table_name || `Table ${device.table_number || device.id}`);

                // 5. Redirect to splash (Force reload)
                window.location.href = "/splash";

            } catch (err: any) {
                console.error("Failed to fetch device/session:", err);
                setError(getCustomerErrorMessage(
                    err,
                    "We could not open this table. Please scan the QR code again.",
                ));
            }
        };

        fetchDeviceAndLogin();
    }, [uuid]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4 text-center">
                <h1 className="text-2xl font-bold mb-2">Error</h1>
                <p className="text-red-500 text-sm whitespace-pre-wrap break-all">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-primary text-primary-text rounded-lg"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-background">
            <ImSpinner6 className="animate-spin text-primary text-4xl mb-4" />
            <p className="text-muted-foreground font-medium">Connecting to Table...</p>
        </div>
    );
};

export default TableEntry;
