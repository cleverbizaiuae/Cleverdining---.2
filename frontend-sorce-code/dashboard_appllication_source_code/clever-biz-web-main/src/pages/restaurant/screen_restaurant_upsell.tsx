import { useEffect, useMemo, useState } from "react";
import axiosInstance from "@/lib/axios";
import toast from "react-hot-toast";
import { Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";

type UpsellSettings = {
  enabled: boolean;
  strategy: "balanced" | "margin" | "volume";
  aggressiveness: "subtle" | "moderate" | "aggressive";
  show_after_add_to_cart: boolean;
  show_in_cart: boolean;
  show_before_payment: boolean;
  tone: "friendly" | "professional" | "playful";
  prioritized_categories: string;
  prioritized_categories_list?: number[];
  category_role_map: Record<string, number[]>;
};

type Category = {
  id: number;
  Category_name: string;
};

type Item = {
  id: number;
  item_name: string;
};

type Rule = {
  id: number;
  type: "pair" | "block";
  source_item: number;
  source_item_name?: string;
  target_item: number;
  target_item_name?: string;
  is_active: boolean;
};

type UpsellAnalytics = {
  total_shown: number;
  total_accepted: number;
  acceptance_rate: number;
  upsell_revenue: string;
  avg_upsell_value: string;
  by_trigger: Array<{ trigger_point: string; shown: number; accepted: number; acceptance_rate: number; revenue: string }>;
  by_category: Array<{ category: string; shown: number; accepted: number; acceptance_rate: number; revenue: string }>;
  top_items: Array<{ item_id: number | null; item_name: string; shown: number; accepted: number; revenue: string }>;
};

const DEFAULT_SETTINGS: UpsellSettings = {
  enabled: true,
  strategy: "balanced",
  aggressiveness: "moderate",
  show_after_add_to_cart: true,
  show_in_cart: true,
  show_before_payment: true,
  tone: "friendly",
  prioritized_categories: "",
  prioritized_categories_list: [],
  category_role_map: { main: [], drinks: [], desserts: [], starters: [] },
};

const ROLE_KEYS = ["main", "drinks", "desserts", "starters"] as const;

const ScreenRestaurantUpsell = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UpsellSettings>(DEFAULT_SETTINGS);
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [analytics, setAnalytics] = useState<UpsellAnalytics | null>(null);
  const [newRule, setNewRule] = useState<{ type: "pair" | "block"; source_item?: number; target_item?: number }>({
    type: "pair",
  });

  const currency = useMemo(() => {
    try {
      const raw = localStorage.getItem("userInfo");
      if (!raw) return "AED";
      const parsed = JSON.parse(raw);
      return parsed?.restaurants?.[0]?.currency || parsed?.user?.restaurants?.[0]?.currency || "AED";
    } catch {
      return "AED";
    }
  }, []);

  const fetchAllOwnerItems = async (): Promise<Item[]> => {
    const allItems: Item[] = [];
    let page = 1;
    let hasNext = true;
    let safety = 0;
    while (hasNext && safety < 30) {
      const response = await axiosInstance.get(`/owners/items/?page=${page}&search=`);
      const payload = response.data || {};
      const rows = Array.isArray(payload?.results) ? payload.results : [];
      allItems.push(
        ...rows
          .filter((row: any) => row && Number.isInteger(row.id))
          .map((row: any) => ({ id: row.id, item_name: row.item_name || `Item ${row.id}` }))
      );
      hasNext = Boolean(payload?.next);
      page += 1;
      safety += 1;
    }
    return allItems;
  };

  const fetchUpsellData = async () => {
    try {
      setLoading(true);
      const [settingsRes, rulesRes, analyticsRes, categoriesRes, itemsRes] = await Promise.all([
        axiosInstance.get("/api/upsell/settings"),
        axiosInstance.get("/api/upsell/rules"),
        axiosInstance.get("/api/upsell/analytics"),
        axiosInstance.get("/owners/categories/"),
        fetchAllOwnerItems(),
      ]);
      const categoryRowsRaw = Array.isArray(categoriesRes.data)
        ? categoriesRes.data
        : Array.isArray(categoriesRes.data?.results)
          ? categoriesRes.data.results
          : [];
      const categoryRows: Category[] = categoryRowsRaw
        .filter((entry: any) => entry && Number.isInteger(entry.id))
        .map((entry: any) => ({
          id: entry.id,
          Category_name: entry.Category_name || entry.name || `Category ${entry.id}`,
        }));

      const settingsData = settingsRes.data || DEFAULT_SETTINGS;
      const prioritizedList = Array.isArray(settingsData.prioritized_categories_list)
        ? settingsData.prioritized_categories_list
        : String(settingsData.prioritized_categories || "")
            .split(",")
            .map((entry: string) => Number(entry.trim()))
            .filter((value: number) => Number.isInteger(value));

      setSettings({
        ...DEFAULT_SETTINGS,
        ...settingsData,
        prioritized_categories_list: prioritizedList,
        category_role_map: {
          main: settingsData?.category_role_map?.main || [],
          drinks: settingsData?.category_role_map?.drinks || [],
          desserts: settingsData?.category_role_map?.desserts || [],
          starters: settingsData?.category_role_map?.starters || [],
        },
      });
      setRules(Array.isArray(rulesRes.data) ? rulesRes.data : []);
      setAnalytics(analyticsRes.data || null);
      setCategories(categoryRows);
      setItems(itemsRes);
    } catch (error) {
      toast.error("Failed to load upsell controls.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpsellData();
  }, []);

  const togglePrioritizedCategory = (categoryId: number) => {
    setSettings((prev) => {
      const current = new Set(prev.prioritized_categories_list || []);
      if (current.has(categoryId)) current.delete(categoryId);
      else current.add(categoryId);
      return {
        ...prev,
        prioritized_categories_list: Array.from(current),
      };
    });
  };

  const toggleRoleCategory = (role: (typeof ROLE_KEYS)[number], categoryId: number) => {
    setSettings((prev) => {
      const current = new Set(prev.category_role_map?.[role] || []);
      if (current.has(categoryId)) current.delete(categoryId);
      else current.add(categoryId);
      return {
        ...prev,
        category_role_map: {
          ...prev.category_role_map,
          [role]: Array.from(current),
        },
      };
    });
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const prioritized = (settings.prioritized_categories_list || []).join(",");
      const payload = {
        ...settings,
        prioritized_categories: prioritized,
        category_role_map: settings.category_role_map,
      };
      const response = await axiosInstance.put("/api/upsell/settings", payload);
      const data = response.data || {};
      setSettings((prev) => ({
        ...prev,
        ...data,
        prioritized_categories_list: Array.isArray(data.prioritized_categories_list)
          ? data.prioritized_categories_list
          : prev.prioritized_categories_list,
      }));
      toast.success("Upsell settings updated.");
    } catch {
      toast.error("Failed to save upsell settings.");
    } finally {
      setSaving(false);
    }
  };

  const addRule = async () => {
    if (!newRule.source_item || !newRule.target_item) {
      toast.error("Select both source and target items.");
      return;
    }
    if (newRule.source_item === newRule.target_item) {
      toast.error("Source and target items must be different.");
      return;
    }
    try {
      const response = await axiosInstance.post("/api/upsell/rules", {
        type: newRule.type,
        source_item: newRule.source_item,
        target_item: newRule.target_item,
      });
      setRules((prev) => [response.data, ...prev]);
      setNewRule({ type: newRule.type });
      toast.success("Upsell rule created.");
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || "Failed to create rule.");
    }
  };

  const deleteRule = async (ruleId: number) => {
    try {
      await axiosInstance.delete(`/api/upsell/rules/${ruleId}`);
      setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
      toast.success("Rule deleted.");
    } catch {
      toast.error("Failed to delete rule.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#0055FE]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Upsell Control Center</h2>
          <p className="text-sm text-slate-500">Manage triggers, scoring bias, rules, and performance analytics.</p>
        </div>
        <button
          onClick={fetchUpsellData}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Shown</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{analytics?.total_shown ?? 0}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Accepted</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{analytics?.total_accepted ?? 0}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Acceptance Rate</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{(analytics?.acceptance_rate ?? 0).toFixed(2)}%</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Upsell Revenue</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {currency} {Number(analytics?.upsell_revenue || 0).toFixed(2)}
          </p>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Engine Settings</h3>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#0055FE] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.show_after_add_to_cart}
              onChange={(e) => setSettings((prev) => ({ ...prev, show_after_add_to_cart: e.target.checked }))}
            />
            Trigger: Add To Cart
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.show_in_cart}
              onChange={(e) => setSettings((prev) => ({ ...prev, show_in_cart: e.target.checked }))}
            />
            Trigger: Cart
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={settings.show_before_payment}
              onChange={(e) => setSettings((prev) => ({ ...prev, show_before_payment: e.target.checked }))}
            />
            Trigger: Before Payment
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">Strategy</p>
            <select
              value={settings.strategy}
              onChange={(e) => setSettings((prev) => ({ ...prev, strategy: e.target.value as UpsellSettings["strategy"] }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="balanced">Balanced</option>
              <option value="margin">Margin</option>
              <option value="volume">Volume</option>
            </select>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Aggressiveness</p>
            <select
              value={settings.aggressiveness}
              onChange={(e) => setSettings((prev) => ({ ...prev, aggressiveness: e.target.value as UpsellSettings["aggressiveness"] }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="subtle">Subtle</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Tone</p>
            <select
              value={settings.tone}
              onChange={(e) => setSettings((prev) => ({ ...prev, tone: e.target.value as UpsellSettings["tone"] }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="playful">Playful</option>
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-2">Prioritized Categories (+15 score)</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {categories.map((category) => {
              const active = (settings.prioritized_categories_list || []).includes(category.id);
              return (
                <button
                  key={`prio-${category.id}`}
                  onClick={() => togglePrioritizedCategory(category.id)}
                  className={`text-left px-3 py-2 rounded-lg border text-sm ${
                    active
                      ? "border-[#0055FE] bg-blue-50 text-[#0055FE]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {category.Category_name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-500">Category Role Mapping</p>
          {ROLE_KEYS.map((role) => (
            <div key={role}>
              <p className="text-sm font-medium text-slate-700 capitalize mb-1">{role}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {categories.map((category) => {
                  const active = (settings.category_role_map?.[role] || []).includes(category.id);
                  return (
                    <button
                      key={`${role}-${category.id}`}
                      onClick={() => toggleRoleCategory(role, category.id)}
                      className={`text-left px-3 py-1.5 rounded-lg border text-xs ${
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {category.Category_name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Manual Rules</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={newRule.type}
            onChange={(e) => setNewRule((prev) => ({ ...prev, type: e.target.value as "pair" | "block" }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="pair">Pair Rule</option>
            <option value="block">Block Rule</option>
          </select>
          <select
            value={newRule.source_item || ""}
            onChange={(e) => setNewRule((prev) => ({ ...prev, source_item: Number(e.target.value) }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Source Item</option>
            {items.map((item) => (
              <option key={`src-${item.id}`} value={item.id}>
                {item.item_name}
              </option>
            ))}
          </select>
          <select
            value={newRule.target_item || ""}
            onChange={(e) => setNewRule((prev) => ({ ...prev, target_item: Number(e.target.value) }))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Target Item</option>
            {items.map((item) => (
              <option key={`tgt-${item.id}`} value={item.id}>
                {item.item_name}
              </option>
            ))}
          </select>
          <button
            onClick={addRule}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white text-sm font-semibold px-3 py-2 hover:bg-slate-800"
          >
            <Plus size={14} />
            Add Rule
          </button>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-left px-3 py-2">Target</th>
                <th className="text-left px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-slate-500">
                    No rules configured.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 capitalize">{rule.type}</td>
                    <td className="px-3 py-2">{rule.source_item_name || rule.source_item}</td>
                    <td className="px-3 py-2">{rule.target_item_name || rule.target_item}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">By Trigger</h4>
          <div className="space-y-2 text-sm">
            {(analytics?.by_trigger || []).map((row) => (
              <div key={row.trigger_point} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                <span className="capitalize">{row.trigger_point.replace(/_/g, " ")}</span>
                <span className="text-slate-600">
                  {row.accepted}/{row.shown} ({row.acceptance_rate.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">Top Upsell Items</h4>
          <div className="space-y-2 text-sm">
            {(analytics?.top_items || []).slice(0, 8).map((row) => (
              <div key={`${row.item_id}-${row.item_name}`} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                <span className="truncate pr-2">{row.item_name || "Unknown item"}</span>
                <span className="text-slate-600 whitespace-nowrap">{row.accepted} accepted</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ScreenRestaurantUpsell;
