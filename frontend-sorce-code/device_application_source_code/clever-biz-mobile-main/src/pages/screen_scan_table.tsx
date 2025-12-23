import { QrCode } from "lucide-react";

const ScreenScanTable = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <QrCode size={40} className="text-blue-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to CleverBiz</h1>
            <p className="text-gray-500 mb-8 max-w-xs mx-auto">
                Please scan the QR code on your table to view the menu and place your order.
            </p>

            <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm max-w-sm w-full">
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wider mb-2">How it works</p>
                <ol className="text-left text-sm text-gray-600 space-y-3">
                    <li className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                        Open your phone camera
                    </li>
                    <li className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                        Point at the QR code on table
                    </li>
                    <li className="flex gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                        Start ordering!
                    </li>
                </ol>
            </div>
        </div>
    );
};

export default ScreenScanTable;
