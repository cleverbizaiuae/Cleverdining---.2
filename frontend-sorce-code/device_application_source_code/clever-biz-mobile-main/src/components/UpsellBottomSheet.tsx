import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gem, Plus, X } from "lucide-react";
import type { UpsellSuggestion } from "../lib/upsellApi";
import { OptimizedImage } from "./OptimizedImage";

type Props = {
  open: boolean;
  suggestions: UpsellSuggestion[];
  triggerItem?: {
    item_name?: string;
    name?: string;
    category_name?: string;
    category?: number | string;
  } | null;
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

const normalizeText = (value: unknown) => String(value || "").toLowerCase();

const itemLooksLike = (item: Partial<UpsellSuggestion> | undefined, keywords: string[]) => {
  if (!item) return false;
  const haystack = `${normalizeText(item.category_name)} ${normalizeText(item.item_name)} ${normalizeText(item.description)}`;
  return keywords.some((keyword) => haystack.includes(keyword));
};

const getContextualUpsellCopy = (
  suggestion: UpsellSuggestion | undefined,
  triggerItem: Props["triggerItem"],
) => {
  if (!suggestion) {
    return {
      label: "Recommended",
      reason: "A smart add-on for this order.",
    };
  }

  const triggerName = String(triggerItem?.item_name || triggerItem?.name || "your order").trim();
  const suggestionName = String(suggestion.item_name || "this").trim();
  const suggestedIsDessert = itemLooksLike(suggestion, ["dessert", "sweet", "cake", "ice", "crepe", "chocolate"]);
  const suggestedIsDrink = itemLooksLike(suggestion, ["drink", "juice", "mojito", "cola", "water", "coffee", "tea", "shake"]);
  const suggestedIsStarter = itemLooksLike(suggestion, ["starter", "side", "fries", "salad", "appetizer"]);
  const triggerIsMain = normalizeText(triggerItem?.category_name).includes("main")
    || itemLooksLike(
      {
        item_name: triggerName,
        category_name: String(triggerItem?.category_name || ""),
      },
      ["burger", "pizza", "pasta", "steak", "main", "chicken", "beef", "rice"]
    );

  const explicitLabel = (suggestion as UpsellSuggestion & { label?: string }).label;
  if (explicitLabel) {
    return {
      label: String(explicitLabel),
      reason: suggestion.upsell_message || "Customers often add this to complete the order.",
    };
  }

  if (suggestedIsDessert && triggerIsMain) {
    return {
      label: "Save room for this",
      reason: "Most complete meals end with dessert. Don't miss out.",
    };
  }

  if (suggestedIsDrink && triggerIsMain) {
    return {
      label: "Perfect with your order",
      reason: `${suggestionName} is a natural match with ${triggerName}.`,
    };
  }

  if (suggestedIsStarter) {
    return {
      label: "Also worth adding",
      reason: "A small add-on to make the meal feel complete.",
    };
  }

  return {
    label: suggestion.upsell_rule || "Recommended",
    reason: suggestion.upsell_message || "Customers often add this to complete the order.",
  };
};

export default function UpsellBottomSheet({
  open,
  suggestions,
  triggerItem,
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
  const contextualCopy = getContextualUpsellCopy(primaryItem, triggerItem);
  const label = contextualCopy.label;

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
            className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismissAll}
          />

          <motion.div
            className="fixed bottom-0 left-1/2 z-[70] w-full max-w-[430px] -translate-x-1/2 rounded-t-[28px] border-t border-slate-100 bg-white px-5 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-4 text-slate-900 shadow-[0_-22px_55px_rgba(15,23,42,0.18)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="inline-flex min-w-0 items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[#4b2a12]">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#4b2a12]/10 text-[#4b2a12]">
                  <Gem className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
                {label}
              </p>

              <button
                onClick={handleDismissAll}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isMulti ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {shownItems.map((item) => (
                    <div key={item.id} className="relative flex flex-col gap-2 rounded-2xl bg-slate-50 p-3">
                      <div className="relative overflow-hidden rounded-xl bg-white">
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

                      <p className="line-clamp-2 pr-4 text-sm font-bold leading-tight text-slate-900">{item.item_name}</p>
                      <p className="mt-1 text-sm font-bold text-[#552500]">
                        {currencyCode} {toSafePrice(item.price).toFixed(2)}
                      </p>

                      <button
                        type="button"
                        onClick={() => void handleAccept(item)}
                        disabled={addingItemId !== null}
                        className="mt-auto h-10 w-full rounded-xl bg-[#552500] text-sm font-bold text-white hover:bg-[#442000] disabled:cursor-wait disabled:opacity-60"
                      >
                        {addingItemId === item.id ? "Adding..." : "Add"}
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleDismissAll}
                  className="mt-4 w-full py-1 text-center text-sm font-medium text-slate-400 hover:text-slate-600"
                >
                  No thanks
                </button>
              </>
            ) : primaryItem ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                    <OptimizedImage
                      src={primaryItem.image1}
                      alt={primaryItem.item_name}
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mt-0.5 line-clamp-1 text-xs font-medium text-slate-400">{contextualCopy.reason}</p>
                    <p className="truncate text-base font-bold text-slate-900">{primaryItem.item_name}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{primaryItem.description || "Popular with this meal."}</p>
                    <p className="mt-1.5 text-sm font-bold text-[#552500]">
                      {currencyCode} {toSafePrice(primaryItem.price).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDeclineSingle(primaryItem)}
                    className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 shadow-sm hover:bg-slate-50"
                  >
                    No thanks
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAccept(primaryItem)}
                    disabled={addingItemId !== null}
                    className="inline-flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#552500] px-4 text-sm font-bold text-white shadow-lg shadow-[#552500]/20 hover:bg-[#442000] disabled:cursor-wait disabled:opacity-60"
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
