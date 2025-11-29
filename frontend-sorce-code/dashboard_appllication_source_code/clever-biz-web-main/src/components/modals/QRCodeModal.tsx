import {
    Dialog,
    DialogBackdrop,
    DialogPanel,
    DialogTitle,
} from "@headlessui/react";
import QRCode from "react-qr-code";

interface QRCodeModalProps {
    isOpen: boolean;
    close: () => void;
    data: {
        id: number;
        table_name: string;
    } | null;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
    isOpen,
    close,
    data,
}) => {
    if (!data) return null;

    // URL to encode in the QR code
    // Using the mobile app URL with query parameters for table and device ID
    const qrValue = `https://clever-biz-mobile.netlify.app/login?table=${encodeURIComponent(
        data.table_name
    )}&id=${data.id}`;

    return (
        <Dialog
            open={isOpen}
            as="div"
            className="relative z-50 focus:outline-none"
            onClose={close}
        >
            <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <DialogPanel
                        transition
                        className="w-full max-w-sm rounded-xl bg-sidebar p-6 shadow-xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0 border border-white/10"
                    >
                        <DialogTitle
                            as="h3"
                            className="text-lg font-medium text-white text-center mb-6"
                        >
                            QR Code for {data.table_name}
                        </DialogTitle>

                        <div className="flex flex-col items-center gap-6">
                            <div className="bg-white p-4 rounded-xl">
                                <QRCode
                                    value={qrValue}
                                    size={200}
                                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                    viewBox={`0 0 256 256`}
                                />
                            </div>

                            <div className="text-center text-gray-400 text-sm break-all">
                                <p className="mb-2">Scan to open menu:</p>
                                <p className="text-xs opacity-50">{qrValue}</p>
                            </div>

                            <button
                                className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                                onClick={close}
                            >
                                Close
                            </button>
                        </div>
                    </DialogPanel>
                </div>
            </div>
        </Dialog>
    );
};
