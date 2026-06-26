/**
 * WalletPayment Components
 * 
 * Apple Pay and Google Pay buttons using Payment Request API
 * These work on mobile web browsers that support the respective wallets
 */

import { useState, useEffect, useCallback } from 'react';
import axiosInstance from '../lib/axios';
import { cachedGet } from '../lib/requestCache';

interface WalletPaymentProps {
    amount: number;
    orderId: string | number;
    onSuccess: (result: WalletPaymentResult) => void;
    onError: (error: string) => void;
    onCancel: () => void;
    restaurantName?: string;
    currencyCode?: string;
    countryCode?: string;
}

interface WalletPaymentResult {
    status: 'success' | 'cancelled' | 'failed';
    paymentId?: number;
    transactionId?: string;
    message?: string;
    fullyPaid?: boolean;
    remainingAmount?: string | number;
    paymentStatus?: string;
}

interface WalletAvailability {
    apple_pay_available: boolean;
    google_pay_available: boolean;
    gateway_provider?: string;
    google_environment?: string;
    google_merchant_id?: string;
}

/**
 * Hook to check wallet availability from backend
 */
export const useWalletAvailability = (restaurantId: string | number | null) => {
    const [availability, setAvailability] = useState<WalletAvailability>({
        apple_pay_available: false,
        google_pay_available: false
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!restaurantId) {
            setLoading(false);
            return;
        }

        cachedGet(`/api/customer/wallet-availability/?restaurant_id=${restaurantId}`, {}, { ttlMs: 60_000 })
            .then(res => {
                setAvailability(res.data);
            })
            .catch(err => {
                console.error('Failed to fetch wallet availability:', err);
            })
            .finally(() => setLoading(false));
    }, [restaurantId]);

    return { availability, loading };
};

/**
 * Check if browser supports Payment Request API
 */
const isPaymentRequestSupported = (): boolean => {
    return 'PaymentRequest' in window;
};

/**
 * Check if Apple Pay is available on this device
 */
const isApplePaySupported = async (): Promise<boolean> => {
    if (!isPaymentRequestSupported()) return false;

    // Check for Apple Pay specifically
    if ('ApplePaySession' in window) {
        try {
            return (window as any).ApplePaySession.canMakePayments();
        } catch {
            return false;
        }
    }

    // Fallback: Try Payment Request with apple-pay method
    try {
        const request = new PaymentRequest(
            [{ supportedMethods: 'https://apple.com/apple-pay' }],
            { total: { label: 'Test', amount: { currency: 'AED', value: '0.01' } } }
        );
        return await request.canMakePayment() || false;
    } catch {
        return false;
    }
};

/**
 * Check if Google Pay is available on this device
 */
const isGooglePaySupported = async (): Promise<boolean> => {
    if (!isPaymentRequestSupported()) return false;

    try {
        const request = new PaymentRequest(
            [{
                supportedMethods: 'https://google.com/pay',
                data: {
                    environment: 'TEST',
                    apiVersion: 2,
                    apiVersionMinor: 0,
                    allowedPaymentMethods: [{
                        type: 'CARD',
                        parameters: {
                            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                            allowedCardNetworks: ['VISA', 'MASTERCARD']
                        }
                    }]
                }
            }],
            { total: { label: 'Test', amount: { currency: 'AED', value: '0.01' } } }
        );
        return await request.canMakePayment() || false;
    } catch {
        return false;
    }
};

/**
 * Apple Pay Button Component
 */
export const ApplePayButton = ({
    amount,
    orderId,
    onSuccess,
    onError,
    onCancel,
    restaurantName = 'CleverDining',
    currencyCode = 'AED',
    countryCode = 'AE',
}: WalletPaymentProps) => {
    const [isSupported, setIsSupported] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        isApplePaySupported().then(setIsSupported);
    }, []);

    const handleApplePay = useCallback(async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            const paymentRequest = new PaymentRequest(
                [{
                    supportedMethods: 'https://apple.com/apple-pay',
                    data: {
                        version: 3,
                        merchantIdentifier: 'merchant.com.cleverdining',
                        merchantCapabilities: ['supports3DS'],
                        supportedNetworks: ['visa', 'masterCard', 'amex'],
                        countryCode: countryCode
                    }
                }],
                {
                    total: {
                        label: restaurantName,
                        amount: { currency: currencyCode, value: amount.toFixed(2) }
                    }
                }
            );

            const response = await paymentRequest.show();

            // Get token from Apple Pay response
            const token = JSON.stringify(response.details);

            // Send token to backend
            const result = await axiosInstance.post('/api/customer/payment/wallet/confirm/', {
                order_id: orderId,
                wallet_type: 'apple_pay',
                wallet_token: token,
                amount: amount
            });

            await response.complete('success');

            onSuccess({
                status: 'success',
                paymentId: result.data.payment_id,
                transactionId: result.data.transaction_id,
                message: result.data.message,
                fullyPaid: result.data.fully_paid,
                remainingAmount: result.data.remaining_amount,
                paymentStatus: result.data.payment_status,
            });

        } catch (error: any) {
            if (error.name === 'AbortError') {
                onCancel();
            } else {
                console.error('Apple Pay error:', error);
                onError(error.message || 'Apple Pay failed');
            }
        } finally {
            setIsProcessing(false);
        }
    }, [amount, orderId, restaurantName, onSuccess, onError, onCancel, isProcessing, currencyCode, countryCode]);

    if (!isSupported) return null;

    return (
        <button
            onClick={handleApplePay}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 px-4 rounded-lg font-semibold transition-all duration-200 hover:bg-gray-900 disabled:opacity-50"
            style={{ minHeight: '50px' }}
        >
            {isProcessing ? (
                <span className="animate-pulse">Processing...</span>
            ) : (
                <>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    Pay with Apple Pay
                </>
            )}
        </button>
    );
};

/**
 * Google Pay Button Component
 */
export const GooglePayButton = ({
    amount,
    orderId,
    onSuccess,
    onError,
    onCancel,
    restaurantName = 'CleverDining',
    currencyCode = 'AED',
    countryCode = 'AE',
}: WalletPaymentProps) => {
    const [isSupported, setIsSupported] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        isGooglePaySupported().then(setIsSupported);
    }, []);

    const handleGooglePay = useCallback(async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            const paymentRequest = new PaymentRequest(
                [{
                    supportedMethods: 'https://google.com/pay',
                    data: {
                        environment: 'PRODUCTION', // Use 'TEST' for testing
                        apiVersion: 2,
                        apiVersionMinor: 0,
                        merchantInfo: {
                            merchantName: restaurantName,
                            merchantId: 'BCR2DN4TXXX' // Replace with actual Google Merchant ID
                        },
                        allowedPaymentMethods: [{
                            type: 'CARD',
                            parameters: {
                                allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                                allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX']
                            },
                            tokenizationSpecification: {
                                type: 'PAYMENT_GATEWAY',
                                parameters: {
                                    gateway: 'stripe', // or 'paytabs'
                                    gatewayMerchantId: 'your_gateway_merchant_id'
                                }
                            }
                        }],
                        transactionInfo: {
                            totalPriceStatus: 'FINAL',
                            totalPrice: amount.toFixed(2),
                            currencyCode: currencyCode,
                            countryCode: countryCode
                        }
                    }
                }],
                {
                    total: {
                        label: restaurantName,
                        amount: { currency: currencyCode, value: amount.toFixed(2) }
                    }
                }
            );

            const response = await paymentRequest.show();

            // Get token from Google Pay response
            const token = JSON.stringify(response.details);

            // Send token to backend
            const result = await axiosInstance.post('/api/customer/payment/wallet/confirm/', {
                order_id: orderId,
                wallet_type: 'google_pay',
                wallet_token: token,
                amount: amount
            });

            await response.complete('success');

            onSuccess({
                status: 'success',
                paymentId: result.data.payment_id,
                transactionId: result.data.transaction_id,
                message: result.data.message,
                fullyPaid: result.data.fully_paid,
                remainingAmount: result.data.remaining_amount,
                paymentStatus: result.data.payment_status,
            });

        } catch (error: any) {
            if (error.name === 'AbortError') {
                onCancel();
            } else {
                console.error('Google Pay error:', error);
                onError(error.message || 'Google Pay failed');
            }
        } finally {
            setIsProcessing(false);
        }
    }, [amount, orderId, restaurantName, onSuccess, onError, onCancel, isProcessing, currencyCode, countryCode]);

    if (!isSupported) return null;

    return (
        <button
            onClick={handleGooglePay}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 bg-white text-gray-800 py-3 px-4 rounded-lg font-semibold border border-gray-300 transition-all duration-200 hover:bg-gray-50 disabled:opacity-50"
            style={{ minHeight: '50px' }}
        >
            {isProcessing ? (
                <span className="animate-pulse">Processing...</span>
            ) : (
                <>
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Pay with Google Pay
                </>
            )}
        </button>
    );
};

export default { ApplePayButton, GooglePayButton, useWalletAvailability };
