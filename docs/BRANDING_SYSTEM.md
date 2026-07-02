# Branding System

This document describes the current branding implementation across the Django backend, the restaurant dashboard, and the mobile customer app.

## Data Model

Branding is stored per restaurant in `brand_configs`.

- Backend model: `backend_source_code/Restaurants/restaurant/models.py`
- Table: `brand_configs`
- Relationship: `BrandConfig.restaurant` is a `OneToOneField` to `Restaurant`
- Runtime schema guard: `backend_source_code/Restaurants/restaurant/schema_guard.py`

Images are stored as text fields, normally as compressed base64 data URLs. There is no separate image upload endpoint, object storage bucket, or CDN for branding images in the current implementation.

Key fields:

| Field | Purpose |
| --- | --- |
| `restaurant_name` | Restaurant name shown in branded customer UI. |
| `logo_url` | Logo image data URL or URL. |
| `cover_image_url` | Cover/hero image data URL or URL. |
| `cover_position` | CSS object-position for the customer menu hero image. Defaults to `50% 50%`. |
| `primary_color` | Main customer-facing brand color. Defaults to `#0055FE`. |
| `secondary_color` | Stored for future use. Not broadly applied in customer UI yet. |
| `accent_color` | Stored for future use. Not broadly applied in customer UI yet. |
| `theme_preset` | `classic_clean`, `luxury_dark`, or `warm_casual`. |
| `font_preset` | `modern`, `elegant`, or `bold`. |
| `tagline` | Optional short subtitle. |
| `branding_enabled` | Explicit custom-branding toggle. |
| `instagram_url`, `facebook_url`, `tiktok_url`, `twitter_url`, `website_url` | Optional social links. |
| `wifi_name`, `wifi_password` | Optional guest WiFi details. |

`googleReviewUrl` is exposed through the brand-config API, but it is stored on the `Restaurant` model as `google_review_url`, not on `BrandConfig`.

## API

Endpoint:

```text
GET /api/brand-config/?restaurant_id=<id>
PUT /api/brand-config/
```

Implementation:

- View: `backend_source_code/Restaurants/restaurant/views.py` (`BrandConfigAPIView`)
- Serializer: `backend_source_code/Restaurants/restaurant/serializers.py` (`BrandConfigSerializer`)

Read behavior:

- `GET` is public-readable for customer devices.
- If `restaurant_id` is supplied, the backend resolves that restaurant and returns its config.
- If no config row exists yet, the backend creates one for that restaurant with defaults.
- If the schema is missing or partially deployed, the runtime schema guard attempts to backfill the table/columns before reading.
- `GET /api/brand-config/?restaurant_id=...` is cached server-side for 60 seconds per restaurant.

Write behavior:

- `PUT` requires an authenticated owner, admin, or manager user.
- The request body may include `restaurant_id` to select the restaurant.
- The backend upserts the restaurant's `BrandConfig` row.
- `googleReviewUrl` is written to `Restaurant.google_review_url`.
- Saving invalidates the per-restaurant backend cache immediately.

## Admin Branding Dashboard

Current dashboard branding page:

```text
frontend-sorce-code/dashboard_appllication_source_code/clever-biz-web-main/src/pages/multilocation/screen_multilocation_branding.tsx
```

Current routes:

```text
/multilocation/branding
/restaurant/branding
/manageradmindashboard/branding
/admindashboard/branding
```

`/restaurant/branding`, `/manageradmindashboard/branding`, and `/admindashboard/branding` render the same editor inside the restaurant dashboard layout. `/multilocation/branding` remains the multi-location workspace route.

The page contains:

- Master toggle for `brandingEnabled`
- Restaurant name and tagline fields
- Logo and cover image upload fields
- Primary, secondary, and accent color pickers
- AI color extractor
- Theme preset selector
- Font preset selector
- Social links
- Google review URL
- Guest WiFi fields
- Sticky live phone preview with Splash/Menu modes

Saving uses:

```text
frontend-sorce-code/dashboard_appllication_source_code/clever-biz-web-main/src/lib/useBrandConfig.ts
```

`useBrandConfigMutation()` sends `PUT /api/brand-config/`, writes the saved payload to localStorage cache, and refetches the `brand-config` query.

Important behavior:

- Save sends the current explicit `brandingEnabled` toggle value. It does not force branding back on when an owner turns it off.
- The preview updates from local React state immediately, before save.
- The dashboard brand query uses React Query with a 4-second refetch interval and refetches on window focus.

## Image Upload Flow

Logo and cover image uploads are processed in the browser.

1. The selected image file is read locally.
2. The browser draws it onto an HTML canvas.
3. The image is resized so the longest dimension is at most 1200px.
4. The canvas exports a JPEG at 82% quality.
5. The resulting `data:image/jpeg;base64,...` string is stored in form state.
6. On save, the data URL is sent inside the JSON body of `PUT /api/brand-config/`.
7. Customer devices receive the same data URL from `GET /api/brand-config/` and render it with normal image tags/backgrounds.

This keeps implementation simple, but it means large logos/covers increase JSON payload size. The 1200px / 82% compression is the safeguard.

## Global Brand CSS Injection

The mobile app wraps its routes with a root `BrandWrapper` in:

```text
frontend-sorce-code/device_application_source_code/clever-biz-mobile-main/src/routes.tsx
```

The wrapper reads the current restaurant's brand config and sets these CSS variables on `document.documentElement`:

- `--primary`: HSL value derived from `primaryColor`, used by Tailwind/Radix-style primary utilities.
- `--brand-primary`: raw hex brand color for inline styles.

When `brandingEnabled` is explicitly true, the wrapper also applies the configured font family to the document root. Meaningful logo/cover/name content can still render the branded hero through the customer fallback rule, but it does not apply a custom font unless the toggle is on.

## Customer Mobile App Data Flow

Mobile brand hook:

```text
frontend-sorce-code/device_application_source_code/clever-biz-mobile-main/src/lib/useBrandConfig.ts
```

Current behavior:

- Reads `cb_brand_config_cache` from localStorage for immediate first paint.
- Reads `customer_branding` as a local bridge fallback.
- Fetches `GET /api/brand-config/?restaurant_id=<id>` when a restaurant id is known.
- Refreshes remote brand config every 4 seconds only while the document is visible.
- Refreshes immediately on browser focus, `visibilitychange`, `storage`, and `branding-updated` events.
- Writes successful remote responses back to `cb_brand_config_cache`.

This keeps customer screens in sync with dashboard changes without a reload while still refreshing immediately on focus and active-session events.

## Smart Branding Fallback

The customer app does not depend only on `brandingEnabled`. It treats branding as available if the restaurant configured meaningful content.

Conceptually:

```text
hasBranding = brandingEnabled OR logoUrl exists OR coverImageUrl exists OR restaurantName != "My Restaurant"
```

This prevents a common failure mode where a restaurant uploads a logo or cover but forgets to turn the toggle on.

## Customer UI Usage Map

| File | Brand fields used |
| --- | --- |
| `frontend-sorce-code/device_application_source_code/clever-biz-mobile-main/src/pages/screen_splash.tsx` | `restaurantName`, `logoUrl`, `coverImageUrl`, `primaryColor`, `themePreset`, `fontPreset`, `brandingEnabled` |
| `frontend-sorce-code/device_application_source_code/clever-biz-mobile-main/src/pages/layout_dashboard.tsx` | `restaurantName`, `tagline`, `logoUrl`, `coverImageUrl`, `coverPosition`, `primaryColor`, `themePreset`, `fontPreset`, `brandingEnabled`, social URLs |
| `frontend-sorce-code/device_application_source_code/clever-biz-mobile-main/src/pages/SuccessPage.tsx` | `restaurantName`, `tagline`, `logoUrl`, `coverImageUrl`, `primaryColor`, `themePreset`, `fontPreset`, `googleReviewUrl`, social URLs |
| `frontend-sorce-code/dashboard_appllication_source_code/clever-biz-web-main/src/pages/multilocation/screen_multilocation_branding.tsx` | All editable brand fields and live-preview state |

The mobile route `/thankyou` currently renders `SuccessPage.tsx`.

## Visual Effects

### Cover Image

When `coverImageUrl` is present, it is used for:

- Splash background
- Mobile menu hero
- Thank-you/success background
- Dashboard phone preview

The splash and thank-you/success screens use a full-bleed, immersive treatment with a dark overlay for contrast. If the cover image is missing or fails, the app falls back to a theme-based gradient.

`coverPosition` controls only the mobile menu hero image crop through CSS `object-position`. It does not affect the splash or thank-you background crop.

### Logo

When `logoUrl` is present, it is shown in branded customer surfaces. When it is missing, customer UI falls back to the first letter of the restaurant name.

### Primary Color

The primary color is converted to HSL in the mobile layout and injected as the CSS variable `--primary`, allowing `text-primary`, `bg-primary`, and related Tailwind classes to follow the restaurant color.

It is also used directly in inline styles for surfaces that need opacity/tint variants.

### Theme Preset

| Preset | Effect |
| --- | --- |
| `classic_clean` | Light/clean branded gradient and moderate dark hero overlays. |
| `luxury_dark` | Dark premium gradient and heavier black overlays. |
| `warm_casual` | Warm orange/terracotta gradient and warm-tinted overlays. |

### Font Preset

| Preset | Font family |
| --- | --- |
| `modern` | Inter/system sans-serif style. |
| `elegant` | Playfair Display/Georgia serif style. |
| `bold` | Plus Jakarta Sans/system sans-serif style. |

## Social Links

Social fields are nullable. Empty fields are hidden.

Customer app usage:

- Menu hero: social links can appear in the hero area.
- Thank-you/success page: social links appear in the follow section when configured.
- Website URL is available for the hero/social surface, but is not currently shown on the thank-you/success page.

TikTok uses `Music2` or a custom icon substitute depending on the surface because Lucide does not ship a TikTok icon.

## Google Reviews

`googleReviewUrl` is shown only after the customer completes the flow on the thank-you/success page.

Current behavior:

- If `googleReviewUrl` exists, show a branded "Leave a Review on Google" button.
- If it is empty, hide the button rather than rendering a disabled grey button.
- The button uses the restaurant primary color.

## Guest WiFi

`wifiName` and `wifiPassword` are stored in the brand config payload. Customer surfaces should render WiFi details only when at least one value is configured.

## Static HTML Metadata

Brand config does not currently update static HTML metadata.

Current static entry files:

- Mobile: `frontend-sorce-code/device_application_source_code/clever-biz-mobile-main/index.html`
- Dashboard: `frontend-sorce-code/dashboard_appllication_source_code/clever-biz-web-main/index.html`

These include static titles, favicon links, PWA metadata, and preconnect hints. They are not dynamically updated from `brand_configs` because the apps are client-rendered Vite SPAs. Dynamic share-card metadata would require SSR, edge rendering, or generated per-restaurant landing pages.

## Known Gaps

- `secondaryColor` and `accentColor` are stored but not consistently applied across the customer app.
- Static metadata and favicon are not derived from brand config.
- Website URL is not rendered on the thank-you/success page.
- Branding images are stored in PostgreSQL text columns; object storage/CDN would be better for larger production scale.
- Brand-config updates refresh within 4 seconds on visible mobile sessions, or immediately on focus/local branding events.
