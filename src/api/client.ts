const jsonHeaders = { "Content-Type": "application/json" };
const RAW_SERVER_LIST_URL =
  "https://raw.githubusercontent.com/KNDARK/ip-translate-server/refs/heads/main/ip.txt";
const GITHUB_SERVER_LIST_API_URL =
  "https://api.github.com/repos/KNDARK/ip-translate-server/contents/ip.txt?ref=main";
const TRANSLATE_LOAD_PATH = "/api/translate/load";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const BACKEND_FAILURE_TTL_MS = 10 * 60_000;
const FAILING_BACKENDS_STORAGE_KEY = "k2v_failing_backends";
const failingBackends = new Map<string, number>();

type ServerLoad = {
  active_job_count?: number;
  processing_job_count?: number;
  queued_job_count?: number;
};

function detailMsg(data: unknown): string {
  const d = data as {
    detail?: string | { msg?: string }[];
    error?: string;
  };
  if (typeof d.error === "string") return d.error;
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) {
    return d.detail
      .map((x) =>
        typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : String(x),
      )
      .join(", ");
  }
  return "";
}

function normalizeBaseUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const candidate = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Các path do FastAPI phục vụ (API + static mount) — phải đi qua pool backend khi FE deploy. */
function isBackendPath(path: string): boolean {
  return (
    path.startsWith("/api/") ||
    path.startsWith("/admin/api/") ||
    path.startsWith("/user_logos/") ||
    path.startsWith("/output/") ||
    path.startsWith("/preview_cache/")
  );
}

function isPrimaryServerPreferredPath(path: string): boolean {
  return (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/user/") ||
    path === "/api/guest/bootstrap"
  );
}

/** Nạp tiền / VietQR — luôn xử lý tuần tự 1 máy (sticky sau create), lỗi mới failover. */
function isPaymentApiPath(path: string): boolean {
  return path.startsWith("/api/payment/");
}

const PAYMENT_STICKY_KEY = "k2v_payment_backend_url";

/** Gọi khi đăng xuất để lần sau không còn trỏ nhầm máy cũ. */
export function clearPaymentBackendSticky(): void {
  try {
    sessionStorage.removeItem(PAYMENT_STICKY_KEY);
  } catch {
    /* ignore */
  }
}

function getPaymentStickyBase(): string | null {
  try {
    const raw = sessionStorage.getItem(PAYMENT_STICKY_KEY)?.trim();
    if (!raw) return null;
    return normalizeBaseUrl(raw);
  } catch {
    return null;
  }
}

function onPaymentResponseOk(baseUrl: string, path: string, init: RequestInit): void {
  if (!baseUrl || !isPaymentApiPath(path)) return;
  const method = (init.method || "GET").toUpperCase();
  if (method === "POST" && path.startsWith("/api/payment/create")) {
    try {
      sessionStorage.setItem(PAYMENT_STICKY_KEY, baseUrl);
    } catch {
      /* ignore */
    }
    return;
  }
  if (method === "POST" && path.includes("/api/payment/cancel")) {
    clearPaymentBackendSticky();
  }
}

async function buildOrderedBackendBases(path: string, preferredBaseUrl: string | null): Promise<string[]> {
  const pool = await getServerPoolUrls();
  const pref = normalizeBaseUrl(preferredBaseUrl || "");

  if (isPaymentApiPath(path)) {
    const sticky = getPaymentStickyBase();
    const chain: string[] = [];
    const seen = new Set<string>();
    const push = (b: string) => {
      if (!b || seen.has(b)) return;
      seen.add(b);
      chain.push(b);
    };
    if (sticky && pool.includes(sticky)) push(sticky);
    if (pref && pool.includes(pref)) push(pref);
    for (const b of pool) push(b);
    return chain.length > 0 ? chain : [""];
  }

  const orderedBases: string[] = [];
  if (pref) orderedBases.push(pref);
  if (isPrimaryServerPreferredPath(path)) {
    const primaryBase = pool[0] ?? "";
    if (primaryBase && !orderedBases.includes(primaryBase)) orderedBases.push(primaryBase);
  }
  for (const base of pool) {
    if (!orderedBases.includes(base)) orderedBases.push(base);
  }
  if (orderedBases.length === 0) orderedBases.push("");
  return orderedBases;
}

function loadFailingBackendsFromStorage(): void {
  try {
    const raw = sessionStorage.getItem(FAILING_BACKENDS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    for (const [baseUrl, failedUntil] of Object.entries(parsed)) {
      if (typeof failedUntil === "number" && failedUntil > now) {
        failingBackends.set(baseUrl, failedUntil);
      }
    }
  } catch {
    // ignore storage issues
  }
}

function persistFailingBackends(): void {
  try {
    const now = Date.now();
    const payload: Record<string, number> = {};
    for (const [baseUrl, failedUntil] of failingBackends.entries()) {
      if (failedUntil > now) payload[baseUrl] = failedUntil;
    }
    sessionStorage.setItem(FAILING_BACKENDS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage issues
  }
}

loadFailingBackendsFromStorage();

function parseServerPoolUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [, rawUrl = ""] = line.split("|", 2);
      return normalizeBaseUrl(rawUrl);
    })
    .filter((value): value is string => Boolean(value));
}

async function fetchServerListText(): Promise<string> {
  const apiUrl = new URL(GITHUB_SERVER_LIST_API_URL);
  apiUrl.searchParams.set("_ts", String(Date.now()));
  try {
    const response = await fetch(apiUrl.toString(), {
      cache: "no-store",
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        content?: string;
        encoding?: string;
      };
      if (payload.encoding === "base64" && typeof payload.content === "string") {
        return atob(payload.content.replace(/\s+/g, ""));
      }
    }
  } catch {
    // fall through to raw GitHub URL
  }

  const rawUrl = new URL(RAW_SERVER_LIST_URL);
  rawUrl.searchParams.set("_ts", String(Date.now()));
  const response = await fetch(rawUrl.toString(), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Khong the lay danh sach backend tu Git (${response.status}).`);
  }
  return response.text();
}

async function getServerPoolUrls(): Promise<string[]> {
  try {
    const text = await fetchServerListText();
    const urls = parseServerPoolUrls(text);
    const now = Date.now();
    const filtered = Array.from(new Set(urls)).filter((url) => {
      const failedUntil = failingBackends.get(url) ?? 0;
      if (failedUntil > now) return false;
      if (failedUntil > 0) {
        failingBackends.delete(url);
        persistFailingBackends();
      }
      return true;
    });
    return filtered.length > 0 ? filtered : Array.from(new Set(urls));
  } catch {
    return [];
  }
}

function joinUrl(baseUrl: string, path: string): string {
  if (isAbsoluteHttpUrl(path)) return path;
  if (path.startsWith("/")) return `${baseUrl}${path}`;
  return `${baseUrl}/${path}`;
}

function buildTargetUrl(path: string, baseUrl: string | null): string {
  if (isAbsoluteHttpUrl(path)) return path;
  if (baseUrl && isBackendPath(path)) return joinUrl(baseUrl, path);
  return path;
}

async function parseErrorResponse(response: Response): Promise<Error> {
  const err = await response.json().catch(() => ({}));
  return new Error(detailMsg(err) || response.statusText || `HTTP ${response.status}`);
}

function shouldRetryResponse(response: Response): boolean {
  return RETRYABLE_STATUS_CODES.has(response.status);
}

function markBackendFailure(baseUrl: string): void {
  failingBackends.set(baseUrl, Date.now() + BACKEND_FAILURE_TTL_MS);
  persistFailingBackends();
}

function clearBackendFailure(baseUrl: string): void {
  if (failingBackends.delete(baseUrl)) {
    persistFailingBackends();
  }
}

async function fetchWithBackendFallback(
  path: string,
  init: RequestInit = {},
  options?: { preferredBaseUrl?: string | null },
): Promise<Response> {
  if (isAbsoluteHttpUrl(path) || !isBackendPath(path)) {
    return fetch(path, init);
  }

  const orderedBases = await buildOrderedBackendBases(path, options?.preferredBaseUrl ?? null);

  let lastError: Error | null = null;
  for (const baseUrl of orderedBases) {
    const target = buildTargetUrl(path, baseUrl || null);
    try {
      const response = await fetch(target, init);
      if (baseUrl && response.ok) {
        clearBackendFailure(baseUrl);
        if (isPaymentApiPath(path)) {
          onPaymentResponseOk(baseUrl, path, init);
        }
      }
      if (!response.ok && shouldRetryResponse(response)) {
        if (baseUrl) markBackendFailure(baseUrl);
        lastError = await parseErrorResponse(response);
        continue;
      }
      return response;
    } catch (error) {
      if (baseUrl) markBackendFailure(baseUrl);
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Khong the ket noi toi backend nao trong danh sach ip.txt.");
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options?: { preferredBaseUrl?: string | null },
): Promise<T> {
  const response = await fetchWithBackendFallback(path, init, options);
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

async function getTranslationPreferredBackend(path: string): Promise<string | null> {
  if (isPaymentApiPath(path)) {
    const urls = await getServerPoolUrls();
    const sticky = getPaymentStickyBase();
    if (sticky && urls.includes(sticky)) return sticky;
    return urls[0] ?? null;
  }
  if (isPrimaryServerPreferredPath(path) || path !== "/api/translate/start") {
    const urls = await getServerPoolUrls();
    return urls[0] ?? null;
  }

  const urls = await getServerPoolUrls();
  if (urls.length === 0) return null;

  const loads = await Promise.all(
    urls.map(async (baseUrl, index) => {
      try {
        const response = await fetch(joinUrl(baseUrl, TRANSLATE_LOAD_PATH), {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          if (shouldRetryResponse(response)) markBackendFailure(baseUrl);
          return null;
        }
        const data = (await response.json()) as ServerLoad;
        const activeJobCount = Number(data.active_job_count ?? Number.POSITIVE_INFINITY);
        if (!Number.isFinite(activeJobCount)) return null;
        clearBackendFailure(baseUrl);
        return { baseUrl, index, activeJobCount };
      } catch {
        markBackendFailure(baseUrl);
        return null;
      }
    }),
  );

  const available = loads.filter((item): item is { baseUrl: string; index: number; activeJobCount: number } => Boolean(item));
  if (available.length === 0) return urls[0];

  available.sort((a, b) => {
    if (a.activeJobCount !== b.activeJobCount) return a.activeJobCount - b.activeJobCount;
    return a.index - b.index;
  });
  return available[0]?.baseUrl ?? urls[0];
}

export async function apiGet<T>(path: string): Promise<T> {
  const preferredBaseUrl = await getTranslationPreferredBackend(path);
  return requestJson<T>(
    path,
    { credentials: "include" },
    { preferredBaseUrl },
  );
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const preferredBaseUrl = await getTranslationPreferredBackend(path);
  return requestJson<T>(
    path,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    { preferredBaseUrl },
  );
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const preferredBaseUrl = await getTranslationPreferredBackend(path);
  return requestJson<T>(
    path,
    {
      method: "PATCH",
      credentials: "include",
      headers: jsonHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    { preferredBaseUrl },
  );
}

export async function apiDelete<T>(path: string): Promise<T> {
  const preferredBaseUrl = await getTranslationPreferredBackend(path);
  return requestJson<T>(
    path,
    { method: "DELETE", credentials: "include" },
    { preferredBaseUrl },
  );
}

export async function apiPostJob<T>(path: string, body?: unknown): Promise<T> {
  const preferredBaseUrl = await getTranslationPreferredBackend(path);
  return requestJson<T>(
    path,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    { preferredBaseUrl },
  );
}

/** POST FormData tới backend trong pool — bắt buộc khi FE deploy (Vercel): không dùng fetch('/api/...') same-origin. */
export async function apiPostFormData<T>(path: string, formData: FormData): Promise<T> {
  const preferredBaseUrl = await getTranslationPreferredBackend(path);
  const response = await fetchWithBackendFallback(
    path,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    },
    { preferredBaseUrl },
  );
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

/** fetch tới backend trong pool, trả Response thô (404, v.v.) — dùng cho poll không qua requestJson. */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const preferredBaseUrl = await getTranslationPreferredBackend(path);
  return fetchWithBackendFallback(
    path,
    { credentials: "include", ...init },
    { preferredBaseUrl },
  );
}
