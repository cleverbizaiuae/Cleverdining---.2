import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
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
                // Fetch device details by UUID
                const response = await axiosInstance.get(`/customer/devices/${uuid}/`);
                const device = response.data;

                // Create guest session data
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

                // Store session
                localStorage.setItem("userInfo", JSON.stringify(mockUserInfo));
                localStorage.setItem("accessToken", "guest_token");
                localStorage.setItem("refreshToken", "guest_refresh");

                // Redirect to dashboard
                navigate("/dashboard");

            } catch (err) {
                console.error("Failed to fetch device details:", err);
                setError("Invalid Table URL or Table not found.");
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
