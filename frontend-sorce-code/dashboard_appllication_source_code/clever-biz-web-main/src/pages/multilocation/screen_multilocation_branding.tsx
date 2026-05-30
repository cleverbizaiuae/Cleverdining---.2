import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  AlertCircle,
  Camera,
  Eye,
  EyeOff,
  Facebook,
  Globe,
  ImageIcon,
  ImagePlus,
  Instagram,
  Link2,
  Loader2,
  Music2,
  Paintbrush,
  Palette,
  RefreshCw,
  Save,
  Sparkles,
  Star,
  Trash2,
  Twitter,
  Type,
  Upload,
  Wifi,
  X,
} from "lucide-react";
import { saveBrandingSettings } from "./store";
import {
  DEFAULT_BRAND,
  FONT_PRESETS,
  THEME_PRESETS,
  type BrandConfig,
  type FontPreset,
  type ThemePreset,
  useBrandConfig,
  useBrandConfigMutation,
} from "../../lib/useBrandConfig";

type ExtractedImage = {
  id: string;
  url: string;
  colors: string[];
};

type SuggestedPalette = {
  primaryColor: string;
  secondaryColor: string | null;
  accentColor: string | null;
  themePreset: ThemePreset;
  fontPreset: FontPreset;
};

const CARD_SHELL = "bg-white border border-slate-200 rounded-2xl p-5";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

function resolveRestaurantId(): string | null {
  try {
    const storedRestaurantId = localStorage.getItem("restaurantId") || localStorage.getItem("selectedRestaurantId");
    if (storedRestaurantId) return storedRestaurantId;

    const raw = localStorage.getItem("userInfo");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id =
      parsed?.user?.restaurants?.[0]?.id ??
      parsed?.restaurants?.[0]?.id ??
      parsed?.restaurant?.id ??
      parsed?.restaurant_id ??
      parsed?.restaurantId ??
      null;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

function compressImage(
  file: File,
  maxDim = 1200,
  quality = 0.82,
  options: { preserveTransparency?: boolean } = {},
): Promise<string> {
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
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to initialize image canvas"));
        return;
      }

      // Logos need alpha preserved. Exporting a transparent PNG as JPEG
      // flattens transparent pixels and browsers commonly render them black.
      if (!options.preserveTransparency) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);

      if (options.preserveTransparency) {
        resolve(canvas.toDataURL("image/png"));
        return;
      }

      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = (hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return { r: 0, g: 85, b: 254 };
  }
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

function toHex(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function getFontFamily(fontPreset: FontPreset): string {
  if (fontPreset === "elegant") return "'Playfair Display', Georgia, serif";
  if (fontPreset === "bold") return "'Plus Jakarta Sans', system-ui, sans-serif";
  return "'Inter', system-ui, sans-serif";
}

function heroOverlay(theme: ThemePreset): string {
  if (theme === "luxury_dark") return "rgba(0,0,0,0.72)";
  if (theme === "warm_casual") return "rgba(100,30,5,0.55)";
  return "rgba(0,0,0,0.45)";
}

function splashGradient(primaryColor: string, theme: ThemePreset): string {
  if (theme === "luxury_dark") return "linear-gradient(160deg, #0f0f0f 0%, #1a1a2e 100%)";
  if (theme === "warm_casual") return "linear-gradient(160deg, #7c2d12 0%, #c2410c 100%)";
  return `linear-gradient(160deg, ${primaryColor}dd 0%, ${primaryColor} 100%)`;
}

function fallbackPreviewGradient(primaryColor: string): string {
  return `linear-gradient(160deg, ${primaryColor}99 0%, #0a0a1a 100%)`;
}

async function extractDominantColors(sourceUrl: string): Promise<string[]> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for analysis"));
    img.src = sourceUrl;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  canvas.width = 80;
  canvas.height = 80;
  ctx.drawImage(image, 0, 0, 80, 80);

  const data = ctx.getImageData(0, 0, 80, 80).data;
  const buckets = new Map<string, number>();

  for (let idx = 0; idx < data.length; idx += 4) {
    const alpha = data[idx + 3] / 255;
    if (alpha < 0.35) continue;

    const r = Math.round(data[idx] / 32) * 32;
    const g = Math.round(data[idx + 1] / 32) * 32;
    const b = Math.round(data[idx + 2] / 32) * 32;

    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luma <= 0.04 || luma >= 0.92) continue;

    const key = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex]) => hex);
}

function guessTheme(colors: string[]): ThemePreset {
  if (!colors.length) return "classic_clean";
  const avgLum = colors.slice(0, 3).reduce((sum, color) => sum + luminance(color), 0) / Math.min(colors.length, 3);
  if (avgLum < 0.15) return "luxury_dark";
  if (avgLum > 0.5) return "warm_casual";
  return "classic_clean";
}

function guessFont(theme: ThemePreset): FontPreset {
  if (theme === "luxury_dark") return "elegant";
  if (theme === "warm_casual") return "bold";
  return "modern";
}

function extractFilesFromClipboard(event: ClipboardEvent<HTMLDivElement>): File[] {
  const files: File[] = [];

  if (event.clipboardData.files?.length) {
    files.push(...Array.from(event.clipboardData.files));
  }

  const items = event.clipboardData.items;
  if (items?.length) {
    Array.from(items).forEach((item) => {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    });
  }

  return files;
}

type ImageUploadFieldProps = {
  label: string;
  hint: string;
  value: string | null;
  uploading: boolean;
  onChange: (next: string | null) => void;
  onFile: (file: File) => Promise<void>;
};

function ImageUploadField({ label, hint, value, uploading, onChange, onFile }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleIncomingFiles = async (files: FileList | File[]) => {
    const candidate = [...files].find((file) => file.type.startsWith("image/"));
    if (!candidate) return;
    await onFile(candidate);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-600 inline-flex items-center gap-1">
        <ImageIcon className="w-3 h-3" strokeWidth={1.8} />
        <span>{label}</span>
      </p>

      <div
        className={`group relative rounded-xl transition-colors outline-none ${dragging ? "ring-2 ring-[#0055FE]/40 ring-offset-2 ring-offset-white" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(false);
          void handleIncomingFiles(event.dataTransfer.files);
        }}
        onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
          const files = extractFilesFromClipboard(event);
          if (files.length > 0) {
            event.preventDefault();
            void handleIncomingFiles(files);
          }
        }}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        tabIndex={0}
      >
        {value ? (
          <div className="w-full h-28 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            <img src={value} alt={label} className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-lg text-white bg-white/20 hover:bg-white/30 backdrop-blur"
                onClick={(event) => {
                  event.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                Change
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-lg text-white bg-red-500/70 hover:bg-red-500"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="w-full h-28 rounded-xl border-2 border-dashed border-slate-200 hover:border-[#0055FE]/40 hover:bg-[#0055FE]/5 transition-colors flex flex-col items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" strokeWidth={1.8} /> : <Upload className="w-5 h-5 text-slate-400" strokeWidth={1.8} />}
            <span className="text-xs font-semibold text-slate-600">{uploading ? "Uploading..." : "Click to upload"}</span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const files = event.target.files;
            if (files?.length) {
              await handleIncomingFiles(files);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>

      <p className="text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}

type ColorFieldProps = {
  label: string;
  required?: boolean;
  value: string | null;
  onChange: (value: string | null) => void;
};

function ColorField({ label, required = false, value, onChange }: ColorFieldProps) {
  const pickerValue = value || "#0055FE";

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-600">
        {label}
        {!required ? <span className="text-slate-400 ml-1">(optional)</span> : null}
      </p>

      <div className="flex items-center gap-2">
        <input
          type="color"
          className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
        />

        <input
          className="h-10 border border-slate-200 rounded-lg px-3 font-mono text-xs flex-1"
          value={value || ""}
          maxLength={7}
          placeholder={required ? "#0055FE" : "Not set"}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "") {
              onChange(required ? "#0055FE" : null);
              return;
            }
            if (/^#[0-9a-fA-F]{0,6}$/.test(next)) {
              onChange(next);
            }
          }}
        />

        {!required && value ? (
          <button
            type="button"
            className="text-[10px] text-slate-400 hover:text-red-500"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

type AiColorExtractorProps = {
  extracting: boolean;
  analysisBusy: boolean;
  images: ExtractedImage[];
  suggestedPalette: SuggestedPalette | null;
  onAddFiles: (files: FileList | File[]) => Promise<void>;
  onRemoveImage: (id: string) => void;
  onClear: () => void;
  onAnalyse: () => Promise<void>;
  onApply: () => void;
};

function AiColorExtractor({
  extracting,
  analysisBusy,
  images,
  suggestedPalette,
  onAddFiles,
  onRemoveImage,
  onClear,
  onAnalyse,
  onApply,
}: AiColorExtractorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const imageCountLabel = images.length === 1 ? "image" : "images";

  return (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
        <p className="text-sm font-semibold text-slate-900">Auto-Extract Brand Colors from Images</p>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Upload or paste screenshots of your website, menu, or restaurant ambience. The system will analyse the images and suggest your
        brand colors, theme, and font style automatically.
      </p>

      <div
        className={`w-full min-h-[96px] rounded-xl border-2 border-dashed transition-colors p-4 outline-none ${dragging ? "border-[#0055FE]/40 bg-[#0055FE]/5" : "border-slate-200"}`}
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(false);
          void onAddFiles(event.dataTransfer.files);
        }}
        onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
          const files = extractFilesFromClipboard(event);
          if (files.length > 0) {
            event.preventDefault();
            void onAddFiles(files);
          }
        }}
      >
        {images.length === 0 ? (
          <div className="h-full min-h-[64px] flex flex-col items-center justify-center text-center gap-1.5">
            {extracting ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" strokeWidth={1.8} /> : <Upload className="w-5 h-5 text-slate-400" strokeWidth={1.8} />}
            <p className="text-xs text-slate-600">
              <span className="font-semibold">Click to upload</span>, drag & drop, or <span className="font-semibold">paste</span> images here
            </p>
            <p className="text-[10px] text-slate-400">Screenshots of your menu, website, or restaurant interior work best</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {images.map((image) => (
              <div key={image.id} className="group relative">
                <div className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden">
                  <img src={image.url} alt="Color source" className="w-full h-full object-cover" />
                </div>
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveImage(image.id);
                  }}
                >
                  <X className="w-3 h-3" strokeWidth={1.8} />
                </button>
                <div className="mt-1.5 flex items-center justify-center gap-1">
                  {image.colors.slice(0, 4).map((color) => (
                    <span key={color} className="w-2.5 h-2.5 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
            ))}

            <button
              type="button"
              className="w-16 h-16 rounded-lg border border-dashed border-slate-300 hover:border-[#0055FE]/40 hover:bg-[#0055FE]/5 inline-flex items-center justify-center"
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
            >
              <ImagePlus className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) {
              void onAddFiles(event.target.files);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>

      {images.length > 0 && !suggestedPalette ? (
        <button
          type="button"
          className="w-full h-10 rounded-md bg-[#0055FE] hover:bg-[#0044DD] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-70"
          disabled={analysisBusy || extracting}
          onClick={() => void onAnalyse()}
        >
          {analysisBusy ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.8} /> : <Sparkles className="w-4 h-4" strokeWidth={1.8} />}
          {analysisBusy ? "Analysing images..." : `Analyse ${images.length} ${imageCountLabel}`}
        </button>
      ) : null}

      {suggestedPalette ? (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Suggested palette</p>

          <div className="flex items-start gap-3 flex-wrap md:flex-nowrap">
            {[
              { key: "primary", label: "Primary", color: suggestedPalette.primaryColor },
              { key: "secondary", label: "Secondary", color: suggestedPalette.secondaryColor },
              { key: "accent", label: "Accent", color: suggestedPalette.accentColor },
            ]
              .filter((entry) => entry.color)
              .map((entry) => (
                <div key={entry.key} className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg shadow-sm border border-slate-200" style={{ backgroundColor: entry.color || undefined }} />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{entry.label}</p>
                    <p className="text-xs font-mono text-slate-500">{entry.color}</p>
                  </div>
                </div>
              ))}

            <div className="md:ml-auto text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">Theme:</span> {THEME_PRESETS.find((p) => p.value === suggestedPalette.themePreset)?.label || suggestedPalette.themePreset}</p>
              <p><span className="font-semibold">Font:</span> {FONT_PRESETS.find((f) => f.value === suggestedPalette.fontPreset)?.label || suggestedPalette.fontPreset}</p>
            </div>
          </div>

          <button
            type="button"
            className="w-full h-9 rounded-md bg-[#0055FE] hover:bg-[#0044DD] text-white text-sm font-semibold"
            onClick={onApply}
          >
            Apply to Brand Settings
          </button>

          <div className="flex justify-end">
            <button
              type="button"
              className="text-[10px] text-slate-400 hover:text-slate-600"
              onClick={onClear}
            >
              Clear extracted images
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type PhonePreviewProps = {
  brand: BrandConfig;
  previewEnabled: boolean;
};

function PhonePreview({ brand, previewEnabled }: PhonePreviewProps) {
  const [screen, setScreen] = useState<"splash" | "menu">("splash");

  const previewBrand = previewEnabled ? brand : DEFAULT_BRAND;
  const hasSocial = Boolean(
    previewBrand.instagramUrl ||
      previewBrand.facebookUrl ||
      previewBrand.tiktokUrl ||
      previewBrand.twitterUrl ||
      previewBrand.websiteUrl
  );

  const restaurantName = previewBrand.restaurantName?.trim() || "My Restaurant";
  const primaryColor = previewBrand.primaryColor || "#0055FE";
  const fontFamily = getFontFamily(previewBrand.fontPreset);

  return (
    <div className={`transition-opacity duration-300 ${previewEnabled ? "opacity-100" : "opacity-40"}`}>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Live Preview</p>
        {!previewEnabled ? (
          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Default look</span>
        ) : null}
      </div>

      <div className="bg-slate-100 rounded-lg p-0.5 mb-3 w-[220px] mx-auto flex">
        <button
          type="button"
          className={`flex-1 h-7 rounded-md text-xs font-semibold ${screen === "splash" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          onClick={() => setScreen("splash")}
        >
          Splash
        </button>
        <button
          type="button"
          className={`flex-1 h-7 rounded-md text-xs font-semibold ${screen === "menu" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          onClick={() => setScreen("menu")}
        >
          Menu
        </button>
      </div>

      <div className="bg-slate-900 rounded-[2.5rem] p-2 shadow-2xl w-[220px] mx-auto">
        <div className="bg-white rounded-[2rem] overflow-hidden h-[420px]" style={{ fontFamily }}>
          {screen === "splash" ? (
            <div className="relative w-full h-full">
              {previewBrand.coverImageUrl ? (
                <>
                  <img
                    src={previewBrand.coverImageUrl}
                    alt="Splash background ambient"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: "blur(12px)", transform: "scale(1.1)" }}
                  />
                  <img
                    src={previewBrand.coverImageUrl}
                    alt="Splash background"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: 0.55 }}
                  />
                </>
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: fallbackPreviewGradient(primaryColor) }}
                />
              )}

              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.6) 100%)" }}
              />

              <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between text-white text-[8px] font-bold">
                <span>9:41</span>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-1.5 rounded-sm bg-white/70" />
                  <span className="w-2 h-1.5 rounded-sm bg-white/70" />
                </div>
              </div>

              <div className="relative h-full flex flex-col items-center justify-center px-4 text-center">
                <div
                  className="h-16 w-16 rounded-full overflow-hidden flex items-center justify-center mb-3"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    backdropFilter: "blur(16px)",
                    border: "1.5px solid rgba(255,255,255,0.25)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                  }}
                >
                  {previewBrand.logoUrl ? (
                    <img src={previewBrand.logoUrl} alt="Brand logo" className="w-10 h-10 object-contain bg-transparent" />
                  ) : (
                    <span className="text-2xl font-bold text-white">{restaurantName.charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <p className="text-white font-bold leading-tight text-[14px]">{restaurantName}</p>
                {previewBrand.tagline ? (
                  <p className="mt-1.5 mb-5 text-[9px] leading-snug text-white/70">{previewBrand.tagline}</p>
                ) : (
                  <div className="mb-6" />
                )}

                <div className="w-full py-2.5 rounded-xl text-[10px] font-bold text-slate-900 bg-white/95">
                  View Menu
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col overflow-hidden">
              <div className="h-5 px-3 flex items-center justify-between text-[8px] font-bold text-slate-700">
                <span>9:41</span>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-1.5 rounded-sm bg-slate-300" />
                  <span className="w-2 h-1.5 rounded-sm bg-slate-300" />
                </div>
              </div>

              <div className="h-24 shrink-0 relative overflow-hidden">
                {previewBrand.coverImageUrl ? (
                  <img src={previewBrand.coverImageUrl} alt="Menu hero" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}44 0%, ${primaryColor}99 100%)` }}
                  />
                )}

                <div className="absolute inset-0" style={{ backgroundColor: heroOverlay(previewBrand.themePreset) }} />

                <div className="relative z-10 h-full px-3 py-2 flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full overflow-hidden flex items-center justify-center" style={previewBrand.logoUrl ? { backgroundColor: "rgba(255,255,255,0.2)", padding: "2px" } : { backgroundColor: `${primaryColor}50` }}>
                    {previewBrand.logoUrl ? (
                      <img src={previewBrand.logoUrl} alt="Logo" className="w-full h-full object-contain bg-transparent" />
                    ) : (
                      <span className="text-white text-xs font-bold">{restaurantName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-white text-xs font-bold truncate">{restaurantName}</p>
                    {previewBrand.tagline ? (
                      <p className="text-[8px] text-white/70 mt-0.5 truncate">{previewBrand.tagline}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="px-2.5 py-2 bg-white">
                <div className="h-5 rounded-lg bg-slate-100 flex items-center px-2 gap-1">
                  <span className="w-1.5 h-1.5 rounded-full border border-slate-300" />
                  <span className="w-16 h-1 bg-slate-200 rounded" />
                </div>
              </div>

              <div className="px-2.5 pb-2 flex items-center gap-1.5 bg-white">
                {["Food", "Drinks", "Desserts"].map((pill, idx) => (
                  <span
                    key={pill}
                    className="rounded-xl px-2 py-1 text-[7px] font-semibold"
                    style={
                      idx === 0
                        ? { backgroundColor: primaryColor, color: "white" }
                        : { backgroundColor: "#f1f5f9", color: "#64748b" }
                    }
                  >
                    {pill}
                  </span>
                ))}
              </div>

              <div className="px-2.5 space-y-2 pb-2 bg-white">
                {[1, 2, 3].map((idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-1.5">
                    <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: `${primaryColor}20` }} />
                    <div className="flex-1">
                      <div className="h-1.5 w-16 bg-slate-300 rounded" />
                      <div className="h-1 w-10 bg-slate-200 rounded mt-1" />
                    </div>
                    <div className="w-5 h-5 rounded-lg text-[10px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                      +
                    </div>
                  </div>
                ))}
              </div>

              {hasSocial ? (
                <div className="px-2.5 pb-1.5 flex items-center gap-1.5 bg-white">
                  {[
                    { key: "instagram", enabled: previewBrand.instagramUrl, Icon: Instagram },
                    { key: "facebook", enabled: previewBrand.facebookUrl, Icon: Facebook },
                    { key: "tiktok", enabled: previewBrand.tiktokUrl, Icon: Music2 },
                    { key: "twitter", enabled: previewBrand.twitterUrl, Icon: Twitter },
                    { key: "website", enabled: previewBrand.websiteUrl, Icon: Globe },
                  ]
                    .filter((entry) => entry.enabled)
                    .map(({ key, Icon }) => (
                      <span key={key} className="w-4 h-4 rounded bg-slate-100 inline-flex items-center justify-center">
                        <Icon className="w-2.5 h-2.5 text-slate-400" strokeWidth={1.8} />
                      </span>
                    ))}
                </div>
              ) : null}

              <div className="mt-auto border-t border-slate-100 flex items-center justify-around py-2 px-1 bg-white">
                {[
                  { label: "Home", active: true },
                  { label: "Cart", active: false },
                  { label: "Orders", active: false },
                ].map((tab) => (
                  <div key={tab.label} className="flex flex-col items-center gap-0.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tab.active ? primaryColor : "#e2e8f0" }} />
                    <span className="text-[7px]" style={{ color: tab.active ? primaryColor : "#94a3b8" }}>{tab.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!previewEnabled ? (
        <p className="text-[10px] text-slate-500 text-center mt-2">Preview is off — showing default platform style</p>
      ) : null}

      <div className="mt-3 space-y-1.5">
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Branding applied to</p>
        {[
          "Splash screen (every QR scan)",
          "Menu hero & category pills",
          "Add to cart buttons",
          "Bottom nav active state",
          "Social media links in footer",
        ].map((item) => (
          <div key={item} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
            <span className="text-xs text-slate-500">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScreenMultiLocationBranding() {
  const restaurantId = resolveRestaurantId();
  const brand = useBrandConfig(restaurantId);
  const mutation = useBrandConfigMutation(restaurantId);

  const [form, setForm] = useState<BrandConfig>(DEFAULT_BRAND);
  const [isDirty, setIsDirty] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [savedOk, setSavedOk] = useState(false);
  const [isProcessing, setProcessing] = useState(false);

  const [extractImages, setExtractImages] = useState<ExtractedImage[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [suggestedPalette, setSuggestedPalette] = useState<SuggestedPalette | null>(null);
  const hydratedRestaurantKeyRef = useRef<string | null>(null);

  const brandSnapshotKey = useMemo(
    () =>
      JSON.stringify({
        id: brand.id ?? null,
        restaurantName: brand.restaurantName,
        logoUrl: brand.logoUrl,
        coverImageUrl: brand.coverImageUrl,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        accentColor: brand.accentColor,
        themePreset: brand.themePreset,
        fontPreset: brand.fontPreset,
        tagline: brand.tagline,
        brandingEnabled: brand.brandingEnabled,
        instagramUrl: brand.instagramUrl,
        facebookUrl: brand.facebookUrl,
        tiktokUrl: brand.tiktokUrl,
        twitterUrl: brand.twitterUrl,
        websiteUrl: brand.websiteUrl,
        wifiName: brand.wifiName,
        wifiPassword: brand.wifiPassword,
        googleReviewUrl: brand.googleReviewUrl,
      }),
    [brand]
  );

  const setField = useCallback(
    <K extends keyof BrandConfig>(key: K, value: BrandConfig[K]) => {
      setIsDirty(true);
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  useEffect(() => {
    const restaurantKey = restaurantId ? String(restaurantId) : "default";
    if (hydratedRestaurantKeyRef.current !== restaurantKey) {
      hydratedRestaurantKeyRef.current = restaurantKey;
      setForm({ ...DEFAULT_BRAND, ...brand });
      setIsDirty(false);
      return;
    }

    if (!isDirty) {
      setForm({ ...DEFAULT_BRAND, ...brand });
    }
  }, [brand, brandSnapshotKey, isDirty, restaurantId]);

  useEffect(() => {
    return () => {
      setExtractImages((prev) => {
        prev.forEach((entry) => URL.revokeObjectURL(entry.url));
        return prev;
      });
    };
  }, []);

  const addExtractorFiles = async (incoming: FileList | File[]) => {
    const files = [...incoming].filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;

    setExtracting(true);
    try {
      const nextEntries: ExtractedImage[] = [];

      for (const file of files) {
        const objectUrl = URL.createObjectURL(file);
        try {
          const colors = await extractDominantColors(objectUrl);
          nextEntries.push({ id: uid("extract"), url: objectUrl, colors: colors.slice(0, 4) });
        } catch {
          URL.revokeObjectURL(objectUrl);
        }
      }

      setExtractImages((prev) => [...prev, ...nextEntries]);
    } finally {
      setExtracting(false);
    }
  };

  const removeExtractedImage = (id: string) => {
    setExtractImages((prev) => {
      const entry = prev.find((item) => item.id === id);
      if (entry) URL.revokeObjectURL(entry.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearExtractorImages = () => {
    setExtractImages((prev) => {
      prev.forEach((entry) => URL.revokeObjectURL(entry.url));
      return [];
    });
  };

  const analysePalette = async () => {
    if (extractImages.length === 0) return;

    setAnalysisBusy(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));

      const colorCounter = new Map<string, number>();
      extractImages.forEach((entry) => {
        entry.colors.forEach((color) => {
          colorCounter.set(color, (colorCounter.get(color) || 0) + 1);
        });
      });

      const sortedColors = [...colorCounter.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([color]) => color);

      const primaryColor = sortedColors[0] || "#0055FE";
      const secondaryColor = sortedColors[1] || null;
      const accentColor = sortedColors[2] || null;
      const themePreset = guessTheme(sortedColors);
      const fontPreset = guessFont(themePreset);

      setSuggestedPalette({
        primaryColor,
        secondaryColor,
        accentColor,
        themePreset,
        fontPreset,
      });
    } finally {
      setAnalysisBusy(false);
    }
  };

  const applySuggestedPalette = () => {
    if (!suggestedPalette) return;
    setIsDirty(true);
    setForm((prev) => ({
      ...prev,
      primaryColor: suggestedPalette.primaryColor,
      secondaryColor: suggestedPalette.secondaryColor,
      accentColor: suggestedPalette.accentColor,
      themePreset: suggestedPalette.themePreset,
      fontPreset: suggestedPalette.fontPreset,
    }));
    clearExtractorImages();
    setSuggestedPalette(null);
  };

  const handleUploadImage = async (file: File, target: "logo" | "cover") => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 25 * 1024 * 1024) {
      alert("Image exceeds 25MB limit.");
      return;
    }

    setProcessing(true);
    try {
      const compressed = await compressImage(file, 1200, 0.82, {
        preserveTransparency: target === "logo",
      });
      if (target === "logo") {
        setField("logoUrl", compressed);
      } else {
        setField("coverImageUrl", compressed);
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
      tagline: form.tagline?.trim() ? form.tagline.trim() : null,
      instagramUrl: form.instagramUrl?.trim() ? form.instagramUrl.trim() : null,
      facebookUrl: form.facebookUrl?.trim() ? form.facebookUrl.trim() : null,
      tiktokUrl: form.tiktokUrl?.trim() ? form.tiktokUrl.trim() : null,
      twitterUrl: form.twitterUrl?.trim() ? form.twitterUrl.trim() : null,
      websiteUrl: form.websiteUrl?.trim() ? form.websiteUrl.trim() : null,
      wifiName: form.wifiName?.trim() ? form.wifiName.trim() : null,
      wifiPassword: form.wifiPassword?.trim() ? form.wifiPassword.trim() : null,
      googleReviewUrl: form.googleReviewUrl?.trim() ? form.googleReviewUrl.trim() : null,
    };

    try {
      const saved = await mutation.mutateAsync(payload);
      setForm(saved);
      setIsDirty(false);
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

  const saveLabel = savedOk ? "Saved!" : "Save Changes";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Paintbrush className="w-5 h-5 text-slate-400" strokeWidth={1.8} />
          <div>
            <h1 className="font-bold text-slate-900">Restaurant Branding</h1>
            <p className="text-sm text-slate-500">Control how customers experience your menu</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 inline-flex items-center gap-2"
            onClick={() => setPreviewEnabled((prev) => !prev)}
          >
            {previewEnabled ? <Eye className="w-3.5 h-3.5" strokeWidth={1.8} /> : <EyeOff className="w-3.5 h-3.5" strokeWidth={1.8} />}
            {previewEnabled ? "Preview On" : "Preview Off"}
          </button>

          <button
            type="button"
            className="h-9 px-3 rounded-md bg-[#0055FE] hover:bg-[#0044DD] text-white text-sm inline-flex items-center gap-2 disabled:opacity-70"
            onClick={handleSave}
            disabled={mutation.isPending || isProcessing}
          >
            {mutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.8} /> : <Save className="w-3.5 h-3.5" strokeWidth={1.8} />}
            {saveLabel}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-5">
          <section className={CARD_SHELL}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">Enable Custom Branding</p>
                <p className="text-xs text-slate-500 mt-0.5">When off, the platform default style is shown to customers</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={form.brandingEnabled}
                onClick={() => setField("brandingEnabled", !form.brandingEnabled)}
                className={`h-7 w-12 rounded-full p-1 transition-colors ${form.brandingEnabled ? "bg-[#0055FE]" : "bg-slate-300"}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${form.brandingEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          </section>

          <section className={CARD_SHELL}>
            <div className="flex items-center gap-2 mb-4">
              <Type className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
              <h2 className="font-semibold text-slate-900">Restaurant Identity</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-xs text-slate-600">Restaurant Name</span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm"
                  placeholder="e.g. Ember & Oak"
                  value={form.restaurantName || ""}
                  onChange={(event) => setField("restaurantName", event.target.value)}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-slate-600">
                  Tagline <span className="text-slate-400">(optional)</span>
                </span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm"
                  placeholder="e.g. Fire-grilled, every time"
                  value={form.tagline || ""}
                  onChange={(event) => setField("tagline", event.target.value || null)}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <ImageUploadField
                label="Logo"
                hint="Recommended: PNG with transparent background. Transparency is preserved in previews and customer screens."
                value={form.logoUrl}
                uploading={isProcessing}
                onChange={(next) => setField("logoUrl", next)}
                onFile={async (file) => handleUploadImage(file, "logo")}
              />

              <ImageUploadField
                label="Cover Image"
                hint="Shown in the menu hero header. An overlay is applied automatically."
                value={form.coverImageUrl}
                uploading={isProcessing}
                onChange={(next) => setField("coverImageUrl", next)}
                onFile={async (file) => handleUploadImage(file, "cover")}
              />
            </div>
          </section>

          <section className={CARD_SHELL}>
            <div className="flex items-center gap-2 mb-1">
              <Palette className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
              <h2 className="font-semibold text-slate-900">Brand Colors</h2>
            </div>
            <p className="text-xs text-slate-500 -mt-2 mb-4">
              Primary color controls buttons, highlights, and active states on the customer menu.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ColorField
                label="Primary"
                required
                value={form.primaryColor}
                onChange={(value) => setField("primaryColor", value || "#0055FE")}
              />
              <ColorField
                label="Secondary"
                value={form.secondaryColor}
                onChange={(value) => setField("secondaryColor", value)}
              />
              <ColorField
                label="Accent"
                value={form.accentColor}
                onChange={(value) => setField("accentColor", value)}
              />
            </div>

            <AiColorExtractor
              extracting={extracting}
              analysisBusy={analysisBusy}
              images={extractImages}
              suggestedPalette={suggestedPalette}
              onAddFiles={addExtractorFiles}
              onRemoveImage={removeExtractedImage}
              onClear={() => {
                clearExtractorImages();
                setSuggestedPalette(null);
              }}
              onAnalyse={analysePalette}
              onApply={applySuggestedPalette}
            />
          </section>

          <section className={CARD_SHELL}>
            <div className="flex items-center gap-2 mb-4">
              <Paintbrush className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
              <h2 className="font-semibold text-slate-900">Visual Style</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-xs text-slate-600">Theme Preset</span>
                <select
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white"
                  value={form.themePreset}
                  onChange={(event) => setField("themePreset", event.target.value as ThemePreset)}
                >
                  {THEME_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label} — {preset.description}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-slate-600">Font Style</span>
                <select
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white"
                  value={form.fontPreset}
                  onChange={(event) => setField("fontPreset", event.target.value as FontPreset)}
                >
                  {FONT_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value} style={{ fontFamily: preset.family }}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-xs text-slate-500 mt-3">Applies to menu headings and labels on the customer-facing menu.</p>
          </section>

          <section className={CARD_SHELL}>
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
              <h2 className="font-semibold text-slate-900">Social Media Links</h2>
            </div>
            <p className="text-xs text-slate-500 -mt-2 mb-4">
              Only filled-in links will appear on the customer-facing menu. Leave empty to hide.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-xs text-slate-600 inline-flex items-center gap-1">
                  <Instagram className="w-3 h-3" strokeWidth={1.8} /> Instagram
                </span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-xs"
                  placeholder="https://instagram.com/yourrestaurant"
                  value={form.instagramUrl || ""}
                  onChange={(event) => setField("instagramUrl", event.target.value || null)}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-slate-600 inline-flex items-center gap-1">
                  <Facebook className="w-3 h-3" strokeWidth={1.8} /> Facebook
                </span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-xs"
                  placeholder="https://facebook.com/yourrestaurant"
                  value={form.facebookUrl || ""}
                  onChange={(event) => setField("facebookUrl", event.target.value || null)}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-slate-600 inline-flex items-center gap-1">
                  <Music2 className="w-3 h-3" strokeWidth={1.8} /> TikTok
                </span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-xs"
                  placeholder="https://tiktok.com/@yourrestaurant"
                  value={form.tiktokUrl || ""}
                  onChange={(event) => setField("tiktokUrl", event.target.value || null)}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-slate-600 inline-flex items-center gap-1">
                  <Twitter className="w-3 h-3" strokeWidth={1.8} /> X / Twitter
                </span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-xs"
                  placeholder="https://x.com/yourrestaurant"
                  value={form.twitterUrl || ""}
                  onChange={(event) => setField("twitterUrl", event.target.value || null)}
                />
              </label>

              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs text-slate-600 inline-flex items-center gap-1">
                  <Globe className="w-3 h-3" strokeWidth={1.8} /> Website
                </span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-xs"
                  placeholder="https://yourrestaurant.com"
                  value={form.websiteUrl || ""}
                  onChange={(event) => setField("websiteUrl", event.target.value || null)}
                />
              </label>
            </div>
          </section>

          <section className={CARD_SHELL}>
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
              <h2 className="font-semibold text-slate-900">Google Reviews</h2>
            </div>
            <p className="text-xs text-slate-500 -mt-2 mb-4">
              Paste your Google review link here. Customers will see a "Leave a Review" button on the thank-you screen after paying — it
              will open directly to your Google review page.
            </p>

            <label className="space-y-1.5 block">
              <span className="text-xs text-slate-600 inline-flex items-center gap-1">
                <Star className="w-3 h-3" strokeWidth={1.8} /> Google Review URL
              </span>
              <input
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-xs"
                placeholder="https://g.page/r/your-place/review"
                value={form.googleReviewUrl || ""}
                onChange={(event) => setField("googleReviewUrl", event.target.value || null)}
              />
            </label>

            <p className="text-[10px] text-slate-400 mt-2">Find yours: Google Maps → your listing → "Get more reviews" → copy link</p>
          </section>

          <section className={CARD_SHELL}>
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
              <h2 className="font-semibold text-slate-900">Guest WiFi</h2>
            </div>
            <p className="text-xs text-slate-500 -mt-2 mb-4">
              WiFi credentials shown on the customer chat/message screen. Leave blank to hide.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1.5">
                <span className="text-xs text-slate-600">Network Name (SSID)</span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-xs"
                  placeholder="e.g. Restaurant_Guest"
                  value={form.wifiName || ""}
                  onChange={(event) => setField("wifiName", event.target.value || null)}
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs text-slate-600">Password</span>
                <input
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-xs"
                  placeholder="e.g. Welcome2024"
                  value={form.wifiPassword || ""}
                  onChange={(event) => setField("wifiPassword", event.target.value || null)}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 inline-flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
            Save always enables branding, image uploads are compressed in-browser, and save errors are surfaced immediately.
          </section>
        </div>

        <div className="lg:sticky lg:top-6">
          <PhonePreview brand={form} previewEnabled={previewEnabled} />
        </div>
      </div>
    </div>
  );
}
