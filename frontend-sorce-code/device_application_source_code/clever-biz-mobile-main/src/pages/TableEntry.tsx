import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axiosInstance from "../lib/axios";
import { ImSpinner6 } from "react-icons/im";

const TableEntry = () => {
    const { uuid } = useParams();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDeviceAndLogin = async () => {
            if (!uuid) return;

            try {
                // 1. Fetch device details by UUID
                const response = await axiosInstance.get(`/customer/devices/${uuid}/`);
                const device = response.data;

                // 2. Resolve Table Session (Get Real Token)
                const sessionRes = await axiosInstance.post('/customer/resolve-table/', {
                    device_id: device.id // Use ID from details
                });

                const { session_token } = sessionRes.data;

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
                            },
                        ],
                    },
                    role: "guest",
                };

                // 4. Store session & info
                localStorage.setItem("userInfo", JSON.stringify(mockUserInfo));
                localStorage.setItem("accessToken", "guest_token"); // Marker for axios interceptor (optional but keeps flow)
                localStorage.setItem("guest_session_token", session_token); // CRITICAL for backend auth
                localStorage.removeItem('cart'); // Clear old cart to be safe

                // 5. Redirect to dashboard
                navigate("/dashboard");

            } catch (err) {
                console.error("Failed to fetch device/session:", err);
                setError("Invalid Table URL or Connection Failed.");
            }
        };

        fetchDeviceAndLogin();
    }, [uuid, navigate]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4 text-center">
                <h1 className="text-2xl font-bold mb-2">Error</h1>
                <p className="text-muted-foreground">{error}</p>
                <button
                    onClick={() => navigate("/")}
                    className="mt-4 px-4 py-2 bg-primary text-white rounded-lg"
                >
                    Go Home
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
