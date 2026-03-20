import type { APIRequestContext, APIResponse } from "@playwright/test";

type LoginPayload = {
  access?: string;
  refresh?: string;
  user?: {
    id?: string | number;
    role?: string;
    email?: string;
    restaurants?: unknown[];
  };
};

type RoleKey = "owner" | "chef" | "staff" | "superadmin";

type SeedCreds = Record<RoleKey, { email: string; password: string }>;

const API_BASE_URL =
  process.env.API_BASE_URL ||
  process.env.VITE_API_URL ||
  "https://cleverdining-2.onrender.com";

const DUPLICATE_ERROR_PATTERN =
  /already exists|already registered|already taken|unique|duplicate/i;

const seedCreds: SeedCreds = {
  superadmin: {
    email:
      process.env.E2E_SUPERADMIN_EMAIL ||
      process.env.E2E_ADMIN_EMAIL ||
      "admin@cleverbiz.ai",
    password:
      process.env.E2E_SUPERADMIN_PASSWORD ||
      process.env.E2E_ADMIN_PASSWORD ||
      "password123",
  },
  owner: {
    email: process.env.E2E_OWNER_EMAIL || "test.owner@example.com",
    password: process.env.E2E_OWNER_PASSWORD || "Password123",
  },
  chef: {
    email: process.env.E2E_CHEF_EMAIL || "test.chef@example.com",
    password: process.env.E2E_CHEF_PASSWORD || "Password123",
  },
  staff: {
    email: process.env.E2E_STAFF_EMAIL || "test.staff@example.com",
    password: process.env.E2E_STAFF_PASSWORD || "Password123",
  },
};

const seedRestaurant = {
  name: "E2E Seed Restaurant",
  ownerName: "E2E Owner",
  location: "E2E City",
  city: "E2E City",
  country: "UAE",
  phone: "5551234567",
  tableCount: 10,
};

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryApi<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) throw error;
      await delay(1_000);
    }
  }
  throw lastError;
}

async function responseBody(response: APIResponse): Promise<string> {
  const text = await response.text().catch(() => "");
  return text || `status ${response.status()}`;
}

function parseListPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const listCandidates = [
    record.results,
    record.data,
    record.restaurants,
    record.items,
  ];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

async function login(
  api: APIRequestContext,
  email: string,
  password: string
): Promise<LoginPayload> {
  const response = await retryApi(
    () =>
      api.post(`${API_BASE_URL}/login/`, {
        data: { email, password },
      }),
    3
  );

  if (!response.ok()) {
    const body = await responseBody(response);
    throw new Error(`Login failed for ${email}: ${response.status()} ${body}`);
  }

  return (await response.json()) as LoginPayload;
}

async function tryLogin(
  api: APIRequestContext,
  email: string,
  password: string
): Promise<LoginPayload | null> {
  try {
    return await login(api, email, password);
  } catch {
    return null;
  }
}

async function ensureSuperAdminAccess(api: APIRequestContext): Promise<string> {
  const superAdmin = await login(
    api,
    seedCreds.superadmin.email,
    seedCreds.superadmin.password
  );

  if (!superAdmin.access) {
    throw new Error("[seed] Superadmin login succeeded but access token missing.");
  }
  return superAdmin.access;
}

async function getRegisteredRestaurants(
  api: APIRequestContext,
  superAdminAccess: string
): Promise<Record<string, unknown>[]> {
  const listRes = await api.get(`${API_BASE_URL}/owners/registered-restaurants/`, {
    headers: { Authorization: `Bearer ${superAdminAccess}` },
  });

  if (!listRes.ok()) return [];
  const payload = await listRes.json().catch(() => null);
  return parseListPayload(payload) as Record<string, unknown>[];
}

export async function createRestaurant(
  api: APIRequestContext,
  superAdminAccess: string
) {
  const existing = await getRegisteredRestaurants(api, superAdminAccess);
  const alreadyPresent = existing.some(
    (row) =>
      String(row.email || "").toLowerCase() ===
      seedCreds.owner.email.toLowerCase()
  );
  if (alreadyPresent) return;

  const primaryCreate = await api.post(
    `${API_BASE_URL}/owners/registered-restaurants/`,
    {
      headers: { Authorization: `Bearer ${superAdminAccess}` },
      data: {
        resturent_name: seedRestaurant.name,
        location: seedRestaurant.location,
        city: seedRestaurant.city,
        country: seedRestaurant.country,
        phone_number: seedRestaurant.phone,
        email: seedCreds.owner.email,
        owner_name: seedRestaurant.ownerName,
        package: "Starter",
        plan: "standard",
        subscription_months: 12,
        qr_codes: 10,
        table_count: seedRestaurant.tableCount,
        payment_processor: "stripe",
        whatsapp_enabled: false,
        password: seedCreds.owner.password,
      },
    }
  );

  if (primaryCreate.ok()) {
    const verify = await getRegisteredRestaurants(api, superAdminAccess);
    const created = verify.some(
      (row) =>
        String(row.email || "").toLowerCase() ===
        seedCreds.owner.email.toLowerCase()
    );
    if (!created) {
      throw new Error("[seed] Restaurant create returned success but row was not found.");
    }
    return;
  }

  const primaryBody = await responseBody(primaryCreate);
  if (!DUPLICATE_ERROR_PATTERN.test(primaryBody)) {
    const fallbackCreate = await api.post(`${API_BASE_URL}/restaurant/create/`, {
      headers: { Authorization: `Bearer ${superAdminAccess}` },
      data: {
        name: seedRestaurant.name,
        owner_name: seedRestaurant.ownerName,
        email: seedCreds.owner.email,
        password: seedCreds.owner.password,
        phone_number: seedRestaurant.phone,
        address: seedRestaurant.location,
        table_count: seedRestaurant.tableCount,
        payment_processor: "stripe",
      },
    });

    if (!fallbackCreate.ok()) {
      const fallbackBody = await responseBody(fallbackCreate);
      if (!DUPLICATE_ERROR_PATTERN.test(fallbackBody)) {
        throw new Error(
          `[seed] Could not create restaurant: ${fallbackCreate.status()} ${fallbackBody}`
        );
      }
    }
  }

  const verify = await getRegisteredRestaurants(api, superAdminAccess);
  const created = verify.some(
    (row) =>
      String(row.email || "").toLowerCase() ===
      seedCreds.owner.email.toLowerCase()
  );
  if (!created) {
    throw new Error(
      `[seed] Seed restaurant missing for owner ${seedCreds.owner.email}.`
    );
  }
}

async function ensureOwner(api: APIRequestContext): Promise<LoginPayload> {
  const existing = await tryLogin(
    api,
    seedCreds.owner.email,
    seedCreds.owner.password
  );
  const hasRestaurant =
    Array.isArray(existing?.user?.restaurants) &&
    existing.user.restaurants.length > 0;
  if (existing?.access && hasRestaurant) return existing;

  const superAdminAccess = await ensureSuperAdminAccess(api);
  await createRestaurant(api, superAdminAccess);

  const owner = await tryLogin(api, seedCreds.owner.email, seedCreds.owner.password);
  if (!owner?.access) {
    throw new Error(
      `[seed] Owner credentials are not valid after seed: ${seedCreds.owner.email}`
    );
  }
  return owner;
}

export async function createUsers(api: APIRequestContext, ownerAccess: string) {
  const members: Array<{ role: "chef" | "staff"; email: string; password: string }> =
    [
      {
        role: "chef",
        email: seedCreds.chef.email,
        password: seedCreds.chef.password,
      },
      {
        role: "staff",
        email: seedCreds.staff.email,
        password: seedCreds.staff.password,
      },
    ];

  for (const member of members) {
    const existing = await tryLogin(api, member.email, member.password);
    if (existing?.access) continue;

    const createRes = await retryApi(
      () =>
        api.post(`${API_BASE_URL}/owners/chef-staff/`, {
          headers: { Authorization: `Bearer ${ownerAccess}` },
          multipart: {
            first_name: `E2E ${member.role}`,
            email: member.email,
            username: member.email,
            password: member.password,
            role: member.role,
          },
        }),
      3
    );

    if (!createRes.ok()) {
      const body = await responseBody(createRes);
      if (!DUPLICATE_ERROR_PATTERN.test(body)) {
        throw new Error(
          `[seed] Could not create ${member.role}: ${createRes.status()} ${body}`
        );
      }
    }

    const seeded = await tryLogin(api, member.email, member.password);
    if (!seeded?.access) {
      throw new Error(
        `[seed] ${member.role} login failed after seed: ${member.email}`
      );
    }
  }
}

export async function createTable(api: APIRequestContext, ownerAccess: string) {
  const listRes = await api.get(`${API_BASE_URL}/owners/devices/?page=1`, {
    headers: { Authorization: `Bearer ${ownerAccess}` },
  });

  if (listRes.ok()) {
    const payload = await listRes.json().catch(() => null);
    const list = parseListPayload(payload);
    if (list.length > 0) return;
  }

  const createRes = await api.post(`${API_BASE_URL}/owners/devices/`, {
    headers: { Authorization: `Bearer ${ownerAccess}` },
    data: {
      table_name: "E2E Table 1",
      region: "Primary",
    },
  });

  if (!createRes.ok()) {
    const body = await responseBody(createRes);
    if (!DUPLICATE_ERROR_PATTERN.test(body) && !/limit reached/i.test(body)) {
      throw new Error(`[seed] Could not create table: ${createRes.status()} ${body}`);
    }
  }

  const verifyRes = await api.get(`${API_BASE_URL}/owners/devices/?page=1`, {
    headers: { Authorization: `Bearer ${ownerAccess}` },
  });
  if (!verifyRes.ok()) {
    const body = await responseBody(verifyRes);
    throw new Error(
      `[seed] Could not verify seeded tables: ${verifyRes.status()} ${body}`
    );
  }

  const verifyPayload = await verifyRes.json().catch(() => null);
  const verifyList = parseListPayload(verifyPayload);
  if (verifyList.length === 0) {
    throw new Error("[seed] No tables found after seed.");
  }
}

export async function seedTestData(api: APIRequestContext) {
  const owner = await ensureOwner(api);
  if (!owner.access) {
    throw new Error("[seed] Owner access token missing.");
  }

  await createUsers(api, owner.access);
  await createTable(api, owner.access);
}
