import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import type { UpsellSuggestion } from "../lib/upsellApi";
import { OptimizedImage } from "./OptimizedImage";

type Props = {
  open: boolean;
  suggestions: UpsellSuggestion[];
  currencyCode: string;
  onAccept: (suggestion: UpsellSuggestion) => void;
  onDeclineSingle: (suggestion: UpsellSuggestion) => void;
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
  onDeclineSingle,
  onDismissSingle,
  onDismissMany,
  onExited,
}: Props) {
  const [localDismissed, setLocalDismissed] = useState<number[]>([]);
  const displayRef = useRef<UpsellSuggestion[]>([]);

  useEffect(() => {
    if (open) {
      setLocalDismissed([]);
      displayRef.current = suggestions.slice(0, 2);
    }
  }, [open, suggestions]);

  const shownItems = useMemo(() => {
    const base = open ? suggestions : displayRef.current;
    return base.filter((item) => !localDismissed.includes(item.id)).slice(0, 2);
  }, [open, suggestions, localDismissed]);

  const isMulti = shownItems.length > 1;
  const primaryItem = shownItems[0];
  const label = "PERFECT WITH YOUR ORDER";

  const handleDeclineSingle = (item: UpsellSuggestion) => {
    setLocalDismissed((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
    onDeclineSingle(item);
  };

  const handleDismissSingle = (item: UpsellSuggestion) => {
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
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismissAll}
          />

          <motion.div
            className="fixed inset-x-0 bottom-0 z-[70] rounded-t-3xl border border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#7A5B36]">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
                {label}
              </p>

              <button
                onClick={handleDismissAll}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isMulti ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {shownItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-2.5 shadow-sm">
                      <div className="relative overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => handleDismissSingle(item)}
                          className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <OptimizedImage
                          src={item.image1}
                          alt={item.item_name}
                          width={240}
                          height={180}
                          className="h-28 w-full object-cover"
                        />
                      </div>

                      <p className="mt-2 truncate text-sm font-semibold text-slate-900">{item.item_name}</p>
                      <p className="mt-0.5 text-sm font-bold text-primary">
                        {currencyCode} {toSafePrice(item.price).toFixed(2)}
                      </p>

                      <button
                        type="button"
                        onClick={() => onAccept(item)}
                        className="mt-2 h-9 w-full rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary/90"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleDismissAll}
                  className="mt-3 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  No thanks
                </button>
              </>
            ) : primaryItem ? (
              <>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-2.5">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                    <OptimizedImage
                      src={primaryItem.image1}
                      alt={primaryItem.item_name}
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{primaryItem.item_name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                      {primaryItem.upsell_message || "A smart add-on for this order."}
                    </p>
                    <p className="line-clamp-1 text-xs text-slate-400">{primaryItem.description || "Popular with this meal."}</p>
                    <p className="mt-1 text-lg font-black text-primary">
                      {currencyCode} {toSafePrice(primaryItem.price).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeclineSingle(primaryItem)}
                    className="h-10 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    No thanks
                  </button>
                  <button
                    type="button"
                    onClick={() => onAccept(primaryItem)}
                    className="h-10 flex-[1.9] rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
                  >
                    Add · {currencyCode} {toSafePrice(primaryItem.price).toFixed(2)}
                  </button>
                </div>
              </>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
