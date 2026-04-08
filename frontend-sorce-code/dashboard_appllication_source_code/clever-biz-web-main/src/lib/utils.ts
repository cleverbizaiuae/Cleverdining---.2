import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format ISO date string to readable format
export function formatDateTime(isoString: string): string {
  try {
    // Parse the ISO string manually to avoid timezone conversion
    const date = new Date(isoString);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return isoString; // Return original if invalid
    }

    // Use UTC methods to avoid timezone conversion
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();

    // Month names
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Format time (12-hour format)
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");

    // Format: "Jan 25, 2025 at 2:15 PM"
    return `${monthNames[month]} ${day}, ${year} at ${displayHours}:${displayMinutes} ${ampm}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return isoString; // Return original if error
  }
}

// Format date only (without time)
export function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);

    if (isNaN(date.getTime())) {
      return isoString;
    }

    // Use UTC methods to avoid timezone conversion
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    // Month names
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Format: "Jan 25, 2025"
    return `${monthNames[month]} ${day}, ${year}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return isoString;
  }
}

// Format time only (without date)
export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return isoString;
    }
    // Use UTC methods to avoid timezone conversion
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    // Format: "2:15 PM"
    return `${displayHours}:${displayMinutes} ${ampm}`;
  } catch (error) {
    console.error("Error formatting time:", error);
    return isoString;
  }
}

export function getActiveRestaurantRegion(): "UAE" | "UK" {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return "UAE";
    const parsed = JSON.parse(raw);
    const region = String(parsed?.restaurants?.[0]?.region || parsed?.user?.restaurants?.[0]?.region || "UAE").toUpperCase();
    return region === "UK" ? "UK" : "UAE";
  } catch {
    return "UAE";
  }
}

export function getActiveRestaurantCurrency(): string {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return "AED";
    const parsed = JSON.parse(raw);
    const explicit = String(
      parsed?.restaurants?.[0]?.currency || parsed?.user?.restaurants?.[0]?.currency || ""
    )
      .trim()
      .toUpperCase();
    if (explicit) return explicit;
    return getActiveRestaurantRegion() === "UK" ? "GBP" : "AED";
  } catch {
    return "AED";
  }
}

export function getActiveRestaurantTimezone(): string {
  return getActiveRestaurantRegion() === "UK" ? "Europe/London" : "Asia/Dubai";
}

export function getActiveRestaurantLocale(): string {
  return getActiveRestaurantRegion() === "UK" ? "en-GB" : "en-AE";
}

export function formatCurrencyAmount(
  value: string | number | null | undefined,
  currency?: string
): string {
  const amount = Number(value || 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${currency || getActiveRestaurantCurrency()} ${safeAmount}`;
}
