import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA Install Prompt — shows:
 * - Android/Desktop: native install banner
 * - iOS Safari: "Add to Home Screen" guidance
 */
export function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] =
        useState<BeforeInstallPromptEvent | null>(null);
    const [showIOSGuide, setShowIOSGuide] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Don't show if already installed or previously dismissed this session
        if (window.matchMedia("(display-mode: standalone)").matches) return;
        if (sessionStorage.getItem("pwa-install-dismissed")) return;

        // Android / Desktop Chrome
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        window.addEventListener("beforeinstallprompt", handler);

        // iOS Safari detection
        const isIOS =
            /iPad|iPhone|iPod/.test(navigator.userAgent) &&
            !(window as unknown as { MSStream?: unknown }).MSStream;
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        if (isIOS && isSafari) {
            setShowIOSGuide(true);
        }

        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
            setDeferredPrompt(null);
        }
        dismiss();
    };

    const dismiss = () => {
        setDismissed(true);
        sessionStorage.setItem("pwa-install-dismissed", "1");
    };

    if (dismissed) return null;
    if (!deferredPrompt && !showIOSGuide) return null;

    return (
        <div
            style={{
                position: "fixed",
                bottom: "1rem",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 9999,
                background: "linear-gradient(135deg, #1a1b3a 0%, #0d1030 100%)",
                color: "#e1e8ff",
                borderRadius: "12px",
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                maxWidth: "420px",
                width: "calc(100% - 2rem)",
                fontSize: "0.875rem",
                fontFamily: "'Inter', 'Poppins', system-ui, sans-serif",
            }}
        >
            <img
                src="/icon-72x72.png"
                alt="CleverBiz"
                style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0 }}
            />

            <div style={{ flex: 1 }}>
                {deferredPrompt ? (
                    <>
                        <strong style={{ display: "block", marginBottom: 2 }}>Install CleverBiz</strong>
                        <span style={{ opacity: 0.7 }}>Get the full app experience</span>
                    </>
                ) : (
                    <>
                        <strong style={{ display: "block", marginBottom: 2 }}>Add to Home Screen</strong>
                        <span style={{ opacity: 0.7 }}>
                            Tap{" "}
                            <span style={{ fontSize: "1.1em" }}>⎋</span> Share → "Add to Home Screen"
                        </span>
                    </>
                )}
            </div>

            {deferredPrompt && (
                <button
                    onClick={handleInstall}
                    style={{
                        background: "#0055FE",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 16px",
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontSize: "0.8rem",
                    }}
                >
                    Install
                </button>
            )}

            <button
                onClick={dismiss}
                aria-label="Dismiss"
                style={{
                    background: "transparent",
                    border: "none",
                    color: "#e1e8ff",
                    opacity: 0.5,
                    cursor: "pointer",
                    fontSize: "1.2rem",
                    padding: "4px",
                    lineHeight: 1,
                }}
            >
                ✕
            </button>
        </div>
    );
}
