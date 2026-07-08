import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import axios from '../lib/axios';
import { Loader2 } from 'lucide-react';
import { getRegionConfig } from '../config/regionConfig';
import { resetUpsellSession } from '../lib/upsellSession';
import { cacheBrandConfigForRestaurant, getBrandSplashSessionKey } from '../lib/useBrandConfig';

export default function TableLanding() {
    const { restaurantId, tableToken } = useParams();
    const [searchParams] = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const resolveTable = async () => {
            const qrDeviceId = searchParams.get('id') || searchParams.get('table_id');
            const qrTableName = searchParams.get('table') || searchParams.get('table_name');
            const qrRestaurantId = searchParams.get('restaurant_id');

            // Payload construction
            const payload: any = {};
            // Always include route params when present
            if (restaurantId) payload.restaurant_id = restaurantId;
            if (tableToken) payload.table_token = tableToken;

            // Always include query params too as fallback/self-healing metadata.
            // This lets stale token links still resolve by device_id/table_name.
            if (qrDeviceId) payload.device_id = qrDeviceId;
            if (qrTableName) payload.table_name = qrTableName;
            if (qrRestaurantId) payload.restaurant_id = qrRestaurantId;

            if (Object.keys(payload).length === 0) {
                // No parameters provided -> Show QR Code Scan prompt instead of error
                return;
            }

            try {
                const candidateRestaurantId = payload.restaurant_id;
                const brandRequest = candidateRestaurantId
                    ? axios.get(`/api/brand-config/?restaurant_id=${encodeURIComponent(candidateRestaurantId)}`).catch(() => null)
                    : Promise.resolve(null);
                const [res, warmedBrand] = await Promise.all([
                    axios.post('/api/customer/resolve-table/', payload),
                    brandRequest,
                ]);

                const { guest_session_id, session_token, table_id, table_name } = res.data;
                const resolvedRestaurantId = res.data.restaurant_id;

                if (warmedBrand && String(candidateRestaurantId) === String(resolvedRestaurantId)) {
                    cacheBrandConfigForRestaurant(resolvedRestaurantId, warmedBrand.data);
                } else if (resolvedRestaurantId) {
                    try {
                        const brandResponse = await axios.get(
                            `/api/brand-config/?restaurant_id=${encodeURIComponent(resolvedRestaurantId)}`,
                        );
                        cacheBrandConfigForRestaurant(resolvedRestaurantId, brandResponse.data);
                    } catch {
                        // Branding remains on safe defaults until the background refresh succeeds.
                    }
                }

                // Store session token
                localStorage.setItem('guest_session_token', session_token);
                // CRITICAL FIX: Remove accessToken to prevent "Identity Crisis"
                // If we don't remove this, WebSocketContext might still try to authenticate as the Owner (Pranay)
                // instead of the Guest (Table 1), causing blue bubbles and confusion.
                localStorage.removeItem('accessToken');

                // Backend treats it as Invalid Token (401) if sent as Bearer.
                // Guest access relies on X-Guest-Session-Token header.

                // Clear old cart backups to prevent leaks between guest sessions.
                localStorage.removeItem('cart');
                Object.keys(localStorage)
                    .filter((key) => key.startsWith('cb:cart:'))
                    .forEach((key) => localStorage.removeItem(key));
                resetUpsellSession();

                // Construct and store userInfo
                const resolvedRegion =
                    String(res.data.restaurant_region || "UAE").toUpperCase() === "UK" ? "UK" : "UAE";
                const regionSettings = getRegionConfig(resolvedRegion);
                const userInfo = {
                    user: {
                        username: table_name || `Table ${table_id}`,
                        email: `${table_id}@guest.com`,
                        restaurants: [
                            {
                                id: res.data.restaurant_id, // Use validated ID from backend
                                table_name: table_name || `Table ${table_id}`,
                                device_id: table_id,
                                resturent_name: res.data.restaurant_name || "Restaurant",
                                region: res.data.restaurant_region || resolvedRegion,
                                currency: res.data.restaurant_currency || regionSettings.currency,
                                timezone: res.data.restaurant_timezone || regionSettings.timezone,
                                country_code: res.data.restaurant_country_code || regionSettings.countryCode,
                                default_payment_provider:
                                    res.data.default_payment_provider || regionSettings.defaultPaymentProvider,
                            },
                        ],
                    },
                    role: "guest",
                };
                localStorage.setItem('userInfo', JSON.stringify(userInfo));
                localStorage.removeItem('cb_brand_config_cache');
                sessionStorage.removeItem('cb_splash_seen');
                sessionStorage.removeItem(getBrandSplashSessionKey(resolvedRestaurantId));

                // Redirect to home (Force reload to initialize WebSocket with new token)
                window.location.href = '/';
            } catch (err: any) {
                console.error("Failed to resolve table", err);
                setError(err.response?.data?.error || "Invalid table link");
            }
        };

        resolveTable();
    }, [restaurantId, tableToken, searchParams]);

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

    // Check if we have params to attempt connection
    const hasParams = restaurantId || searchParams.get('id') || searchParams.get('table_id');

    if (!hasParams && !error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-6 text-center">
                <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mb-6 text-orange-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                </div>
                <h1 className="text-2xl font-bold mb-2">Welcome!</h1>
                <p className="text-gray-400 mb-8 max-w-xs">Please scan the QR code on your table to view the menu and order.</p>
                <div className="text-sm text-gray-500">
                    Need help? Ask a staff member.
                </div>
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
