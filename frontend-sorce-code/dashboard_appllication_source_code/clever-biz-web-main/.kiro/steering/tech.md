# Technology Stack

## Frontend Framework
- **React 19** with TypeScript
- **Vite** as build tool and dev server
- **React Router 7** for client-side routing
- **SWC** for fast compilation via @vitejs/plugin-react-swc

## State Management
- **Redux Toolkit** (@reduxjs/toolkit) for global state
- **React Query** (@tanstack/react-query) for server state and caching
- **React Context** for role-based state (Owner, Staff, Admin contexts)

## UI & Styling
- **Tailwind CSS 4** for styling with Vite plugin
- **Radix UI** components (dropdown-menu, progress)
- **Headless UI** for accessible components
- **Lucide React** for icons
- **Motion** (Framer Motion) for animations
- **Shadcn/ui** component system (New York style)

## Forms & Data
- **React Hook Form** for form management
- **Axios** for HTTP requests
- **Chart.js** with react-chartjs-2 for data visualization
- **React DatePicker** for date inputs

## Development Tools
- **ESLint** with TypeScript support
- **TypeScript 5.7** with strict mode disabled
- **Path aliases** configured (@/* maps to ./src/*)

## Common Commands

```bash
# Development
npm run dev          # Start dev server on port 5175

# Building
npm run build        # TypeScript compile + Vite build

# Code Quality
npm run lint         # Run ESLint

# Preview
npm run preview      # Preview production build
```

## Configuration Notes
- Dev server runs on port 5175 with host: true
- Path alias @ points to src directory
- TypeScript strict mode is disabled
- ESLint configured with React hooks and refresh plugins
- Unused variables/parameters warnings are disabled