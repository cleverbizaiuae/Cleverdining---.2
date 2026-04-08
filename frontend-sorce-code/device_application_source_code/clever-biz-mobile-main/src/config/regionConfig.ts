export type RegionCode = "UAE" | "UK";

export type RegionSettings = {
  currency: string;
  timezone: string;
  phoneCode: string;
  countryCode: string;
  countryAlpha2: string;
  defaultPaymentProvider: string;
  payments: string[];
};

const REGION_CONFIG: Record<RegionCode, RegionSettings> = {
  UAE: {
    currency: "AED",
    timezone: "Asia/Dubai",
    phoneCode: "+971",
    countryCode: "+971",
    countryAlpha2: "AE",
    defaultPaymentProvider: "stripe",
    payments: ["stripe", "checkout", "paytabs", "cash"],
  },
  UK: {
    currency: "GBP",
    timezone: "Europe/London",
    phoneCode: "+44",
    countryCode: "+44",
    countryAlpha2: "GB",
    defaultPaymentProvider: "stripe",
    payments: ["stripe", "payme", "cash"],
  },
};

export const getRegionConfig = (region?: string): RegionSettings => {
  const normalized = (region || "UAE").toUpperCase();
  return REGION_CONFIG[(normalized === "UK" ? "UK" : "UAE") as RegionCode];
};
