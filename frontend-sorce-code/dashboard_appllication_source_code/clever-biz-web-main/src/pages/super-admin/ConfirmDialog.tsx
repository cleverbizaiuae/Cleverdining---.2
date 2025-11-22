// src/components/ConfirmDialog.tsx
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  highlight?: string; // optional highlighted text in the middle (e.g., the item)
  confirmLabel?: string; // default: "Delete"
  cancelLabel?: string; // default: "Cancel"
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean; // red confirm button
};

export default function ConfirmDialog({
  open,
  title,
  message,
  highlight,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onClose,
  onConfirm,
  loading,
  danger = true,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Basic focus handling when opening
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-[92%] max-w-md rounded-2xl bg-[#151821] text-white shadow-2xl ring-1 ring-white/10 p-6"
      >
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 8v5m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>

        <h3 id="confirm-title" className="text-center text-xl font-semibold">
          {title}
        </h3>

        {message && (
          <p className="mt-2 text-center text-sm text-gray-300">{message}</p>
        )}

        {highlight && (
          <div className="mt-4 rounded-md bg-white/5 p-3 text-center text-sm text-gray-200">
            {` ${highlight.substring(0, 20)}.....`}
          </div>
        )}

        <p className="mt-2 text-center text-xs text-red-400">
          This action cannot be undone.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-white/20 disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
              danger
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-accent hover:brightness-110 text-white"
            }`}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const truncate = (s: string, n = 80) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;
