// src/lib/queryClient.ts
// Shared TanStack Query client with Stale-While-Revalidate defaults.
// Data is served instantly from cache for 5 minutes, then refreshed in the background.

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Data is considered "fresh" for 5 minutes — no refetch during this window
            staleTime: 5 * 60 * 1000,

            // Cached data is garbage-collected after 10 minutes of inactivity
            gcTime: 10 * 60 * 1000,

            // Refetch stale data when user returns to the browser tab
            refetchOnWindowFocus: false,

            // Don't refetch when component remounts if data is still fresh
            refetchOnMount: false,

            // Retry failed requests once
            retry: 1,
        },
    },
});
