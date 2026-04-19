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

  const label = useMemo(() => {
    const source = shownItems[0]?.upsell_rule || shownItems[0]?.upsell_stage || "perfect with your order";
    return String(source).replace(/_/g, " ").toUpperCase();
  }, [shownItems]);

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
            className="fixed inset-0 bg-black/45 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismissAll}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl p-5 shadow-2xl border-t border-gray-100"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 250 }}
          >
            <div className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto mb-4" />

            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                  {label}
                </p>
                <h3 className="text-lg font-bold text-gray-900 mt-1">You Might Also Like</h3>
              </div>
              <button
                onClick={handleDismissAll}
                className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {shownItems.length === 1 ? (
              <>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                  <div className="w-[84px] h-[84px] rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    <img
                      src={shownItems[0].image1 || "https://placehold.co/200x200?text=No+Image"}
                      alt={shownItems[0].item_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{shownItems[0].item_name}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {shownItems[0].upsell_message || shownItems[0].description || "Perfect add-on for your meal."}
                    </p>
                    <p className="text-sm font-bold text-primary mt-2">
                      {currencyCode} {toSafePrice(shownItems[0].price).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleSingleDismiss(shownItems[0])}
                    className="h-11 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 px-4 flex-1"
                  >
                    No thanks
                  </button>
                  <button
                    onClick={() => onAccept(shownItems[0])}
                    className="h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 px-4 flex-[2]"
                  >
                    + Add · {currencyCode} {toSafePrice(shownItems[0].price).toFixed(2)}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {shownItems.slice(0, 2).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-2.5">
                      <div className="aspect-[4/5] rounded-xl overflow-hidden bg-slate-100 mb-2">
                        <img
                          src={item.image1 || "https://placehold.co/200x200?text=No+Image"}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "https://placehold.co/200x200?text=No+Image";
                          }}
                        />
                      </div>
                      <p className="text-xs font-bold text-slate-900 truncate">{item.item_name}</p>
                      <p className="text-xs text-primary font-semibold mt-0.5">
                        {currencyCode} {toSafePrice(item.price).toFixed(2)}
                      </p>
                      <button
                        onClick={() => onAccept(item)}
                        className="w-full mt-2 h-9 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleDismissAll}
                  className="w-full mt-3 h-9 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  No thanks
                </button>
              </>
            )}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
