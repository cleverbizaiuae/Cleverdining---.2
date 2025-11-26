# Frontend Environment Setup

## Required Environment Variables

Create a `.env` file in the root of this directory with the following variables:

```bash
# API Backend URL
# Default: /api (uses Netlify proxy to backend)
VITE_API_URL=/api
```

## Configuration Options

### Production (Netlify):
```bash
VITE_API_URL=/api
```
Uses Netlify proxy configured in `netlify.toml` to forward requests to backend.

### Local Development with Local Backend:
```bash
VITE_API_URL=http://localhost:8000
```
Points directly to your local Django backend.

### Local Development with Deployed Backend:
```bash
VITE_API_URL=https://cleverdining-2.onrender.com
```
Points directly to deployed Render backend (useful for testing frontend changes without running backend locally).

## Creating the .env File

```bash
# From this directory, run:
echo 'VITE_API_URL=/api' > .env
```

## Verifying Configuration

The API base URL is set in `src/lib/axios.ts`:
```typescript
const API_BASE_URL = normalizeBaseUrl(
  (import.meta.env.VITE_API_URL as string | undefined) || "/api"
);
```

If `VITE_API_URL` is not set, it defaults to `/api`.

## Notes

- The `.env` file is gitignored and should NOT be committed
- Always use `/api` for production deployments on Netlify
- For local development, you can point directly to backend URLs

