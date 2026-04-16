let sentryReady = false;
let sentryModule: typeof import("@sentry/react") | null = null;
let sentryInitPromise: Promise<void> | null = null;

function getUserType(): string {
  try {
    if (localStorage.getItem("superAdminAuth")) return "superadmin";
    const raw = localStorage.getItem("userInfo");
    if (!raw) return "anonymous";
    const parsed = JSON.parse(raw);
    return parsed?.role || parsed?.user?.role || "unknown";
  } catch {
    return "unknown";
  }
}

function getRegion(): string {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return "unknown";
    const parsed = JSON.parse(raw);
    return (
      parsed?.region ||
      parsed?.restaurant?.region ||
      parsed?.user?.restaurants?.[0]?.region ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || sentryReady || sentryInitPromise) return;

  sentryInitPromise = import("@sentry/react")
    .then((Sentry) => {
      sentryModule = Sentry;
      Sentry.init({
        dsn,
        tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1),
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_RELEASE || undefined,
        beforeSend(event: any) {
          event.tags = {
            ...event.tags,
            region: getRegion(),
            user_type: getUserType(),
          };
          return event;
        },
      });
      sentryReady = true;
    })
    .catch(() => {
      sentryReady = false;
      sentryModule = null;
    })
    .finally(() => {
      sentryInitPromise = null;
    });
}

type CaptureContext = {
  feature?: string;
  endpoint?: string;
  method?: string;
  status?: number | string;
};

export function captureApiFailure(error: unknown, context: CaptureContext = {}): void {
  if (!sentryReady || !sentryModule) return;
  sentryModule.captureException(error, {
    tags: {
      feature: context.feature || "api",
      endpoint: context.endpoint || "unknown",
      method: context.method || "unknown",
      status: String(context.status || "unknown"),
    },
    level: "error",
  });
}

export function captureWebSocketFailure(message: string, context: CaptureContext = {}): void {
  if (!sentryReady || !sentryModule) return;
  sentryModule.captureMessage(message, {
    tags: {
      feature: context.feature || "websocket",
      endpoint: context.endpoint || "unknown",
      status: String(context.status || "failure"),
    },
    level: "warning",
  });
}
