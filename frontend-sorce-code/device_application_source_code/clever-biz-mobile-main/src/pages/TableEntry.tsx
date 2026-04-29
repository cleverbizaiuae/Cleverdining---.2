import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axiosInstance from "../lib/axios";
import { ImSpinner6 } from "react-icons/im";
import { getRegionConfig } from "../config/regionConfig";
import { resetUpsellSession } from "../lib/upsellSession";

const TableEntry = () => {
    const { uuid } = useParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDeviceAndLogin = async () => {
            if (!uuid) return;

            try {
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

                // 4. Store session & info
                // CRITICAL: Clear ALL previous session data first to ensure session isolation
                localStorage.removeItem("guest_session_token");
                localStorage.removeItem("pending_order_id");
                localStorage.removeItem("bulk_checkout");
                localStorage.removeItem("userInfo");
                localStorage.removeItem("accessToken");
                localStorage.removeItem('cart');
                resetUpsellSession();
                // Clear chat/messages state for session isolation
                localStorage.removeItem("chat_messages_cache");
                localStorage.removeItem("newMessage");
                // Old session cleanup complete - now store new session

                localStorage.setItem("userInfo", JSON.stringify(mockUserInfo));
                localStorage.setItem("accessToken", "guest_token"); // Marker for axios interceptor (optional but keeps flow)
                localStorage.setItem("guest_session_token", session_token); // CRITICAL for backend auth

                // 5. Redirect to splash (Force reload)
                window.location.href = "/splash";

            } catch (err: any) {
                console.error("Failed to fetch device/session:", err);
                const status = err.response?.status;
                const statusText = err.response?.statusText;
                const data = JSON.stringify(err.response?.data || {});
                const msg = err.message;
                setError(`Connection Failed: ${status || 'N/A'} ${statusText || ''} - ${msg} \n Data: ${data}`);
            }
        };

        fetchDeviceAndLogin();
    }, [uuid]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4 text-center">
                <h1 className="text-2xl font-bold mb-2">Error</h1>
                <p className="text-red-500 text-sm whitespace-pre-wrap break-all">{error}</p>
                <div className="mt-4 p-2 bg-gray-100 rounded text-xs text-left w-full overflow-auto max-h-40">
                    <p>Debug Info:</p>
                    <p>UUID: {uuid}</p>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-primary text-white rounded-lg"
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
