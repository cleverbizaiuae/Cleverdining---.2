import { QrCode } from "lucide-react";

const ScreenScanTable = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <QrCode size={40} className="text-blue-600" />
            </div>

            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to Clever Dining</h1>
                <p className="text-slate-500">
                    Please scan the QR code on your table to view the menu and place your order.
                </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 mb-8">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center mb-4">How it Works</h3>
                <div className="space-y-4">
                    <div className="flex gap-3 items-start">
                        <div className="w-6 h-6 rounded-full bg-blue-50 text-[#0055FE] font-bold flex items-center justify-center text-sm shrink-0">1</div>
                        <p className="text-sm text-slate-600">Open your phone’s Camera (or QR scanner)</p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="w-6 h-6 rounded-full bg-blue-50 text-[#0055FE] font-bold flex items-center justify-center text-sm shrink-0">2</div>
                        <p className="text-sm text-slate-600">Hold it over the table QR code until a link appears</p>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="w-6 h-6 rounded-full bg-blue-50 text-[#0055FE] font-bold flex items-center justify-center text-sm shrink-0">3</div>
                        <p className="text-sm text-slate-600">Tap the link to start ordering</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreenScanTable;

