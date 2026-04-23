import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import type { UpsellSuggestion } from "../lib/upsellApi";

type Props = {
  open: boolean;
  suggestions: UpsellSuggestion[];
  currencyCode: string;
  onAccept: (suggestion: UpsellSuggestion) => void;
  onDismissSingle: (suggestion: UpsellSuggestion) => void;
  onDismissMany: (suggestions: UpsellSuggestion[]) => void;
  onExited?: () => void;
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
  onDismissSingle,
  onDismissMany,
  onExited,
}: Props) {
  const [localDismissed, setLocalDismissed] = useState<number[]>([]);
  const displayRef = useRef<UpsellSuggestion[]>([]);

  useEffect(() => {
    if (open) {
      setLocalDismissed([]);
      displayRef.current = suggestions;
    }
  }, [open, suggestions]);

  const shownItems = useMemo(() => {
    const base = open ? suggestions : displayRef.current;
    return base.filter((item) => !localDismissed.includes(item.id));
  }, [open, suggestions, localDismissed]);
  const primaryItem = shownItems[0];

  const label = "PERFECT WITH YOUR ORDER";

  const handleSingleDismiss = (item: UpsellSuggestion) => {
    // Exit-before-update: close first, mark dismissed after animation in parent callback.
    setLocalDismissed((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
    onDismissSingle(item);
  };

  const handleDismissAll = () => {
    if (!shownItems.length) return;
    setLocalDismissed(shownItems.map((item) => item.id));
    onDismissMany(shownItems);
  };

  return (
    <AnimatePresence onExitComplete={onExited}>
      {open && shownItems.length > 0 ? (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismissAll}
          />
          <motion.div
            className="fixed left-3 right-3 bottom-[calc(66px+env(safe-area-inset-bottom))] z-[70] bg-white rounded-3xl p-4 shadow-[0_20px_45px_rgba(15,23,42,0.18)] border border-slate-100"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 290, mass: 0.7 }}
          >
            <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-3" />

            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-[#7A5B36] uppercase tracking-[0.13em] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                  {label}
                </p>
              </div>
              <button
                onClick={handleDismissAll}
                className="w-7 h-7 rounded-full text-slate-400 hover:bg-slate-50 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {primaryItem ? (
              <>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-2.5">
                  <div className="w-[64px] h-[64px] rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <img
                      src={primaryItem.image1 || "https://placehold.co/200x200?text=No+Image"}
                      alt={primaryItem.item_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{primaryItem.item_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                      {primaryItem.upsell_message || "Perfect with your order."}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-1">
                      {primaryItem.description || "A classic add-on choice."}
                    </p>
                    <p className="text-base font-black text-[#4B2800] mt-1">
                      {currencyCode} {toSafePrice(primaryItem.price).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleSingleDismiss(primaryItem)}
                    className="h-10 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 px-4 flex-1"
                  >
                    No thanks
                  </button>
                  <button
                    onClick={() => onAccept(primaryItem)}
                    className="h-10 rounded-xl bg-[#4B2800] text-white text-sm font-semibold hover:bg-[#3E2100] px-4 flex-[1.9]"
                  >
                    + Add · {currencyCode} {toSafePrice(primaryItem.price).toFixed(2)}
                  </button>
                </div>
              </>
            ) : (
              <div />
            )}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
