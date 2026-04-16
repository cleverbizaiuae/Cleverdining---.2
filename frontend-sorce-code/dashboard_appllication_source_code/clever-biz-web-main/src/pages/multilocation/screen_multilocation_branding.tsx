import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Save, Trash2 } from "lucide-react";
import { saveBrandingSettings } from "./store";
import {
  DEFAULT_BRAND,
  type BrandConfig,
  useBrandConfig,
  useBrandConfigMutation,
} from "../../lib/useBrandConfig";

function compressImage(file: File, maxDim = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

function resolveRestaurantId(): string | null {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.restaurants?.[0]?.id ? String(parsed.user.restaurants[0].id) : null;
  } catch {
    return null;
  }
}

export default function ScreenMultiLocationBranding() {
  const restaurantId = resolveRestaurantId();
  const brand = useBrandConfig(restaurantId);
  const mutation = useBrandConfigMutation(restaurantId);

  const [form, setForm] = useState<BrandConfig>(DEFAULT_BRAND);
  const [isProcessing, setProcessing] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const logoRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setForm(brand);
  }, [brand]);

  const hasBranding =
    form.brandingEnabled ||
    !!(form.logoUrl || form.coverImageUrl || (form.restaurantName && form.restaurantName !== "My Restaurant"));

  const handleFile = async (file: File, target: "logo" | "cover") => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 25 * 1024 * 1024) {
      alert("Image exceeds 25MB limit.");
      return;
    }

    setProcessing(true);
    try {
      const compressed = await compressImage(file);
      if (target === "logo") {
        setForm((prev) => ({ ...prev, logoUrl: compressed }));
      } else {
        setForm((prev) => ({ ...prev, coverImageUrl: compressed }));
      }
    } catch {
      alert("Could not process image — please try a different file.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    const payload: BrandConfig = {
      ...form,
      brandingEnabled: true,
    };

    try {
      const saved = await mutation.mutateAsync(payload);
      setForm(saved);
      saveBrandingSettings({
        restaurantName: saved.restaurantName,
        logoDataUrl: saved.logoUrl ?? "",
        coverImageDataUrl: saved.coverImageUrl ?? "",
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      console.error("Branding save failed:", err);
      alert("Failed to save branding settings. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-900">Admin Branding</h3>
        <p className="text-sm text-slate-500 mt-1">
          Save always auto-enables branding. Images are compressed client-side (max 1200px, JPEG 82%).
        </p>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <label className="block text-sm text-slate-600">
            Restaurant Display Name
            <input
              value={form.restaurantName}
              onChange={(event) => setForm((prev) => ({ ...prev, restaurantName: event.target.value }))}
              placeholder="Enter branded restaurant name"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="border border-dashed border-slate-300 rounded-xl p-4 cursor-pointer text-center bg-slate-50">
              {form.logoUrl ? (
                <div className="space-y-2">
                  <img src={form.logoUrl} alt="Logo" className="h-24 w-full object-contain rounded-lg bg-white border border-slate-200" />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-red-600"
                    onClick={(event) => {
                      event.preventDefault();
                      setForm((prev) => ({ ...prev, logoUrl: null }));
                    }}
                  >
                    <Trash2 size={12} />
                    Remove Logo
                  </button>
                </div>
              ) : (
                <span className="text-sm text-slate-600 inline-flex items-center gap-2">
                  <ImagePlus size={16} /> Upload Logo
                </span>
              )}
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) await handleFile(file, "logo");
                }}
              />
            </label>

            <label className="border border-dashed border-slate-300 rounded-xl p-4 cursor-pointer text-center bg-slate-50">
              {form.coverImageUrl ? (
                <div className="space-y-2">
                  <img src={form.coverImageUrl} alt="Cover" className="h-24 w-full object-cover rounded-lg border border-slate-200" />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-red-600"
                    onClick={(event) => {
                      event.preventDefault();
                      setForm((prev) => ({ ...prev, coverImageUrl: null }));
                    }}
                  >
                    <Trash2 size={12} />
                    Remove Cover
                  </button>
                </div>
              ) : (
                <span className="text-sm text-slate-600 inline-flex items-center gap-2">
                  <ImagePlus size={16} /> Upload Cover
                </span>
              )}
              <input
                ref={coverRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) await handleFile(file, "cover");
                }}
              />
            </label>
          </div>

          <p className="text-xs text-slate-500 inline-flex items-center gap-1">
            <Camera size={12} />
            25MB request safety is enforced at selection-time to avoid oversize saves.
          </p>

          <button
            onClick={handleSave}
            disabled={mutation.isPending || isProcessing}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Save size={14} />
            {mutation.isPending ? "Saving..." : isProcessing ? "Processing..." : "Save Changes"}
          </button>

          {savedOk && <p className="text-sm text-emerald-600">Saved successfully.</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="h-44 bg-slate-100 relative">
            {hasBranding ? (
              form.coverImageUrl ? (
                <img src={form.coverImageUrl} alt="Brand cover" className="w-full h-full object-cover" />
              ) : (
                <div className="h-full bg-slate-900" />
              )
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No branding configured</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
            <div className="absolute left-4 right-4 bottom-4 flex items-center gap-3">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Brand logo" className="w-12 h-12 rounded-lg object-cover border border-white/30" />
              ) : (
                <span className="w-12 h-12 rounded-lg bg-white/20 border border-white/30" />
              )}
              <div>
                <p className="text-white text-sm">Preview</p>
                <p className="text-white font-semibold">{form.restaurantName?.trim() || "Restaurant Name"}</p>
              </div>
            </div>
          </div>

          <div className="p-5 text-sm text-slate-600 space-y-2">
            <p>Branding Active: <span className="font-semibold text-slate-900">{hasBranding ? "Yes" : "No"}</span></p>
            <p>Save behavior: auto-enables branding state for customer app render paths.</p>
            <p>Errors are surfaced through blocking alerts to avoid silent failures.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
