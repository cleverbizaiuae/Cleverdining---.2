# Clever Biz - Restaurant Management Dashboard

React + TypeScript + Vite dashboard application for restaurant owners, staff, and administrators.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# API Backend URL
VITE_API_URL=/api
```

See `ENV_SETUP.md` for detailed configuration options.

### 3. Run Development Server
```bash
npm run dev
```

The application will run on `http://localhost:5175`

## Build for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

## Environment Configuration

- **Production (Netlify):** `VITE_API_URL=/api` (uses Netlify proxy)
- **Local Development:** `VITE_API_URL=http://localhost:8000` (points to local backend)
- **Testing with Deployed Backend:** `VITE_API_URL=https://cleverdining-2.onrender.com`

See `ENV_SETUP.md` for more details.

## Project Structure

```
src/
├── components/       # Reusable UI components
├── pages/           # Page components
│   ├── authentication/  # Login, register, password reset
│   ├── restaurant/      # Restaurant owner pages
│   ├── chef/           # Chef pages
│   ├── staff/          # Staff pages
│   └── super-admin/    # Admin pages
├── hooks/           # Custom React hooks
├── lib/             # Utilities and configurations
│   └── axios.ts     # API client setup
└── assets/          # Images, logos, etc.
```

## Features

- **Multi-role Authentication:** Owner, Chef, Staff, Admin, Customer
- **JWT Token Management:** Auto-refresh on expiry
- **Restaurant Management:** Menu, orders, devices, staff
- **Real-time Updates:** WebSocket support
- **Responsive Design:** Works on desktop and mobile

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Axios
- React Hook Form
- React Router
- Chart.js
- React Hot Toast

## Development

- **Linting:** `npm run lint`
- **Preview Production Build:** `npm run preview`

## Deployment

Deployed on Netlify with automatic deployments from the main branch.

Backend API is proxied through Netlify to avoid CORS issues (see `netlify.toml`).
