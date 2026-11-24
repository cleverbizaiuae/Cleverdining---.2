import { useDisplayCurrency } from "@/lib/useDisplayCurrency";

/** Header control: show Super Admin amounts in any platform currency. */
export default function SuperAdminCurrencySelect() {
  const { currency, setCurrency, currencies, rates } = useDisplayCurrency();
  const approximate = rates?.approximate?.length ? ` (approximate: ${rates.approximate.join(", ")})` : "";
  const source = rates?.source && rates.source !== "fallback" ? ` Rates by ${rates.source}.` : "";
  const updated = rates?.updated_at ? ` Updated ${rates.updated_at}.` : "";

  return (
    <select
      aria-label="Display currency"
      data-testid="superadmin-display-currency"
      title={`Display currency for Super Admin amounts${approximate}.${source}${updated}`}
      value={currency}
      onChange={(event) => setCurrency(event.target.value)}
      className="h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0055FE]/30 focus:border-[#0055FE]"
    >
      {currencies.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}
