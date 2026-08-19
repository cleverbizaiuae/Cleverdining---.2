import { useEffect, useState } from "react";
import { cachedGet } from "@/lib/requestCache";

type ProviderAvailability = {
  isAllowed?: boolean;
  isConfigured?: boolean;
  isActive?: boolean;
};

export const useOnlinePaymentAvailability = (restaurantId: string | number | null | undefined) => {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(Boolean(restaurantId));

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) {
      setAvailable(false);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    cachedGet<ProviderAvailability[]>(
      "/api/payment-providers",
      { params: { restaurantId } },
      { ttlMs: 30_000 },
    )
      .then((response) => {
        if (cancelled) return;
        const providers = Array.isArray(response.data) ? response.data : [];
        setAvailable(
          providers.some(
            (provider) => provider.isAllowed && provider.isConfigured && provider.isActive,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return { available, loading };
};
