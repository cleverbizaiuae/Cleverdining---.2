export const toSafeNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const getDiscountPercent = (item: { discount_percentage?: unknown }): number => {
  const discount = toSafeNumber(item.discount_percentage);
  if (discount <= 0) return 0;
  return Math.min(100, discount);
};

export const getOriginalItemPrice = (item: { price?: unknown }): number => toSafeNumber(item.price);

export const getEffectiveItemPrice = (item: {
  price?: unknown;
  discount_percentage?: unknown;
  final_price?: unknown;
}): number => {
  const explicitFinal = item.final_price;
  if (explicitFinal !== undefined && explicitFinal !== null && String(explicitFinal).trim() !== "") {
    return toSafeNumber(explicitFinal);
  }

  const price = getOriginalItemPrice(item);
  const discount = getDiscountPercent(item);
  if (discount <= 0) return price;

  return Number((price - (price * discount) / 100).toFixed(2));
};

export const getLineTotal = (
  item: { price?: unknown; discount_percentage?: unknown; final_price?: unknown },
  quantity: unknown
): number => {
  const safeQuantity = Math.max(1, Math.floor(toSafeNumber(quantity) || 1));
  return Number((getEffectiveItemPrice(item) * safeQuantity).toFixed(2));
};

export const hasItemDiscount = (item: { price?: unknown; discount_percentage?: unknown; final_price?: unknown }): boolean => {
  return getDiscountPercent(item) > 0 && getEffectiveItemPrice(item) < getOriginalItemPrice(item);
};
