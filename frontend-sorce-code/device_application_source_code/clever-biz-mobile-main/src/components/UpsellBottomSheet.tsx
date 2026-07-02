import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Sparkles, X } from "lucide-react";
import type { UpsellSuggestion } from "../lib/upsellApi";
import { OptimizedImage } from "./OptimizedImage";

type Props = {
  open: boolean;
  suggestions: UpsellSuggestion[];
  currencyCode: string;
  onAccept: (suggestion: UpsellSuggestion) => void | Promise<void>;
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
  const [addingItemId, setAddingItemId] = useState<number | null>(null);
  const displayRef = useRef<UpsellSuggestion[]>([]);

  useEffect(() => {
    if (open) {
      setLocalDismissed([]);
      setAddingItemId(null);
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

  const handleAccept = async (item: UpsellSuggestion) => {
    if (addingItemId !== null) return;
    setAddingItemId(item.id);
    try {
      await onAccept(item);
    } finally {
      setAddingItemId(null);
    }
  };

  return (
    <AnimatePresence onExitComplete={onExited}>
      {open && shownItems.length > 0 ? (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismissAll}
          />

          <motion.div
            className="fixed bottom-0 left-1/2 z-[70] w-full max-w-[430px] -translate-x-1/2 rounded-t-3xl border-t border-border bg-card px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 text-foreground shadow-2xl shadow-black/50"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
                {label}
              </p>

              <button
                onClick={handleDismissAll}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isMulti ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {shownItems.map((item) => (
                    <div key={item.id} className="relative flex flex-col gap-2 rounded-2xl bg-secondary p-3">
                      <div className="relative overflow-hidden rounded-xl bg-background">
                        <button
                          type="button"
                          onClick={() => handleDismissSingle(item)}
                          className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white/70 shadow hover:text-white"
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

                      <p className="line-clamp-2 pr-4 text-sm font-bold leading-tight text-foreground">{item.item_name}</p>
                      <p className="mt-1 text-sm font-bold text-primary">
                        {currencyCode} {toSafePrice(item.price).toFixed(2)}
                      </p>

                      <button
                        type="button"
                        onClick={() => void handleAccept(item)}
                        disabled={addingItemId !== null}
                        className="mt-auto h-10 w-full rounded-xl bg-primary text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                      >
                        {addingItemId === item.id ? "Adding..." : "Add"}
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleDismissAll}
                  className="mt-4 w-full py-1 text-center text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  No thanks
                </button>
              </>
            ) : primaryItem ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-secondary">
                    <OptimizedImage
                      src={primaryItem.image1}
                      alt={primaryItem.item_name}
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-foreground">{primaryItem.item_name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {primaryItem.upsell_message || "A smart add-on for this order."}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{primaryItem.description || "Popular with this meal."}</p>
                    <p className="mt-1.5 text-sm font-bold text-primary">
                      {currencyCode} {toSafePrice(primaryItem.price).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeclineSingle(primaryItem)}
                    className="h-12 flex-1 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-secondary"
                  >
                    No thanks
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAccept(primaryItem)}
                    disabled={addingItemId !== null}
                    className="inline-flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                  >
                    {addingItemId === primaryItem.id
                      ? "Adding..."
                      : (
                        <>
                          <Plus className="h-4 w-4" strokeWidth={1.8} />
                          Add · {currencyCode} {toSafePrice(primaryItem.price).toFixed(2)}
                        </>
                      )}
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
