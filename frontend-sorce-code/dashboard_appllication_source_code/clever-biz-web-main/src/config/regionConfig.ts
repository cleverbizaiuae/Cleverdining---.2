export type RegionCode = "UAE" | "UK" | "IE" | "GH";

export type RegionSettings = {
  currency: string;
  timezone: string;
  phoneCode: string;
  countryLabel: string;
  payments: string[];
  defaultPaymentProvider: string;
  locale: string;
  flag: string;
  label: string;
};

export const REGION_CONFIG: Record<RegionCode, RegionSettings> = {
  UAE: {
    currency: "AED",
    timezone: "Asia/Dubai",
    phoneCode: "+971",
    countryLabel: "UAE",
    payments: ["stripe", "checkout", "paytabs", "payme", "adyen", "worldpay", "sumup", "square", "cash"],
    defaultPaymentProvider: "stripe",
    locale: "en-AE",
    flag: "🇦🇪",
    label: "UAE",
  },
  UK: {
    currency: "GBP",
    timezone: "Europe/London",
    phoneCode: "+44",
    countryLabel: "United Kingdom",
    payments: ["stripe", "checkout", "payme", "adyen", "worldpay", "sumup", "square", "cash"],
    defaultPaymentProvider: "stripe",
    locale: "en-GB",
    flag: "🇬🇧",
    label: "UK",
  },
  IE: {
    currency: "EUR",
    timezone: "Europe/Dublin",
    phoneCode: "+353",
    countryLabel: "Ireland",
    // PayMe is GBP-only and PayTabs is MENA-only.
    payments: ["stripe", "checkout", "adyen", "worldpay", "sumup", "square", "cash"],
    defaultPaymentProvider: "stripe",
    locale: "en-IE",
    flag: "🇮🇪",
    label: "Ireland",
  },
  GH: {
    currency: "GHS",
    timezone: "Africa/Accra",
    phoneCode: "+233",
    countryLabel: "Ghana",
    // Stripe card payments in GHS; mobile money is not integrated yet.
    payments: ["stripe", "cash"],
    defaultPaymentProvider: "stripe",
    locale: "en-GH",
    flag: "🇬🇭",
    label: "Ghana",
  },
};

/** Regions in the order they appear in region pickers and filters. */
export const REGION_CODES: RegionCode[] = ["UAE", "UK", "IE", "GH"];

const REGION_ALIASES: Record<string, RegionCode> = {
  UAE: "UAE",
  AE: "UAE",
  "UNITED ARAB EMIRATES": "UAE",
  UK: "UK",
  GB: "UK",
  "UNITED KINGDOM": "UK",
  "NORTHERN IRELAND": "UK",
  IE: "IE",
  IRL: "IE",
  IRELAND: "IE",
  "REPUBLIC OF IRELAND": "IE",
  GH: "GH",
  GHA: "GH",
  GHANA: "GH",
};

/** Map any stored region/country value to a supported region; unknown values keep the UAE default. */
export const normalizeRegionCode = (region?: string | null): RegionCode => {
  const key = String(region || "").trim().toUpperCase();
  return REGION_ALIASES[key] ?? "UAE";
};

export const getRegionConfig = (region?: string): RegionSettings => {
  return REGION_CONFIG[normalizeRegionCode(region)];
};
