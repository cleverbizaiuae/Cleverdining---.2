export type RegionCode = "UAE" | "UK";

export type RegionSettings = {
  currency: string;
  timezone: string;
  phoneCode: string;
  countryLabel: string;
  payments: string[];
  defaultPaymentProvider: string;
};

export const REGION_CONFIG: Record<RegionCode, RegionSettings> = {
  UAE: {
    currency: "AED",
    timezone: "Asia/Dubai",
    phoneCode: "+971",
    countryLabel: "UAE",
    payments: ["stripe", "checkout", "paytabs", "payme", "adyen", "worldpay", "sumup", "square", "cash"],
    defaultPaymentProvider: "stripe",
  },
  UK: {
    currency: "GBP",
    timezone: "Europe/London",
    phoneCode: "+44",
    countryLabel: "United Kingdom",
    payments: ["stripe", "checkout", "payme", "adyen", "worldpay", "sumup", "square", "cash"],
    defaultPaymentProvider: "stripe",
  },
};

export const getRegionConfig = (region?: string): RegionSettings => {
  const normalized = (region || "UAE").toUpperCase();
  return REGION_CONFIG[(normalized === "UK" ? "UK" : "UAE") as RegionCode];
};
