export type RegionCode = "UAE" | "UK" | "IE" | "GH";

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
  IE: {
    currency: "EUR",
    timezone: "Europe/Dublin",
    phoneCode: "+353",
    countryCode: "+353",
    countryAlpha2: "IE",
    defaultPaymentProvider: "stripe",
    payments: ["stripe", "checkout", "cash"],
  },
  GH: {
    currency: "GHS",
    timezone: "Africa/Accra",
    phoneCode: "+233",
    countryCode: "+233",
    countryAlpha2: "GH",
    defaultPaymentProvider: "stripe",
    payments: ["stripe", "cash"],
  },
};

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
