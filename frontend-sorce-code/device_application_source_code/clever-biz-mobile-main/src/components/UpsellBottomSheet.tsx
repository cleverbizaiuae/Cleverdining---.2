import { AnimatePresence, motion } from "framer-motion";
import type { UpsellSuggestion } from "../lib/upsellApi";

type Props = {
  open: boolean;
  suggestions: UpsellSuggestion[];
  currencyCode: string;
  onAccept: (suggestion: UpsellSuggestion) => void;
  onDismiss: (suggestion: UpsellSuggestion) => void;
  onClose: () => void;
};

const toSafePrice = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export default function UpsellBottomSheet({
  open,
  suggestions,
  currencyCode,
  onAccept,
  onDismiss,
  onClose,
}: Props) {
  const item = suggestions[0];

  return (
    <AnimatePresence>
      {open && item ? (
        <>
          <motion.div
            className="fixed inset-0 bg-black/35 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl p-5 shadow-2xl border-t border-gray-100"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 24, stiffness: 220 }}
          >
            <div className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto mb-4" />
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
              Suggested Add-on
            </p>
            <h3 className="text-lg font-bold text-gray-900">{item.item_name}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {item.upsell_message || "Your meal is missing a perfect add-on."}
            </p>
            <p className="text-base font-semibold text-blue-700 mt-3">
              {currencyCode} {toSafePrice(item.price).toFixed(2)}
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => onDismiss(item)}
                className="flex-1 h-11 rounded-full border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
              >
                No Thanks
              </button>
              <button
                onClick={() => onAccept(item)}
                className="flex-1 h-11 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                Add · {currencyCode} {toSafePrice(item.price).toFixed(2)}
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

