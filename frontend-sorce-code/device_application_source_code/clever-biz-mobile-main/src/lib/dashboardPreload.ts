let dashboardRuntimePromise: ReturnType<typeof importDashboardRuntime> | null = null;
let homeScreenPromise: ReturnType<typeof importHomeScreen> | null = null;

function importDashboardRuntime() {
  return import("../components/DashboardRuntime");
}

function importHomeScreen() {
  return import("../pages/screen_home");
}

export function loadDashboardRuntime() {
  dashboardRuntimePromise ||= importDashboardRuntime();
  return dashboardRuntimePromise;
}

export function loadHomeScreen() {
  homeScreenPromise ||= importHomeScreen();
  return homeScreenPromise;
}
