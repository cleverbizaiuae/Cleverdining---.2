import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import axios from '../lib/axios';
import { Loader2 } from 'lucide-react';

export default function TableLanding() {
    const { restaurantId, tableToken } = useParams();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const resolveTable = async () => {
            try {
                const res = await axios.post('/customer/resolve-table/', {
                    restaurant_id: restaurantId,
                    table_token: tableToken
                });

                const { guest_session_id, session_token, table_id, table_name } = res.data;

                // Store session token
                localStorage.setItem('guest_session_token', session_token);
                localStorage.setItem('accessToken', session_token); // Use session token as access token
                localStorage.setItem('refreshToken', session_token);

                // Construct and store userInfo
                const userInfo = {
                    user: {
                        username: table_name || `Table ${table_id}`,
                        email: `${table_id}@guest.com`,
                        restaurants: [
                            {
                                id: parseInt(restaurantId || '0'),
                                table_name: table_name || `Table ${table_id}`,
                                device_id: table_id,
                                resturent_name: res.data.restaurant_name || "Restaurant",
                            },
                        ],
                    },
                    role: "guest",
                };
                localStorage.setItem('userInfo', JSON.stringify(userInfo));

                // Redirect to home
                navigate('/');
            } catch (err: any) {
                console.error("Failed to resolve table", err);
                setError(err.response?.data?.error || "Invalid table link");
            }
        };

        if (restaurantId && tableToken) {
            resolveTable();
        } else {
            setError("Invalid link parameters");
        }
    }, [restaurantId, tableToken, navigate]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-4 text-center">
                <div className="text-red-500 text-xl mb-4 font-bold">Connection Failed</div>
                <p className="mb-6 text-gray-300">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-orange-500 hover:bg-orange-600 rounded-full font-medium transition-colors"
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-orange-500" />
            <p>Connecting to table...</p>
        </div>
    );
}
