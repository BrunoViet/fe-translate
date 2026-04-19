const jsonHeaders = { "Content-Type": "application/json" };
const RAW_SERVER_LIST_URL =
  "https://raw.githubusercontent.com/KNDARK/ip-translate-server/refs/heads/main/ip.txt";
const GITHUB_SERVER_LIST_API_URL =
  "https://api.github.com/repos/KNDARK/ip-translate-server/contents/ip.txt?ref=main";
const TRANSLATE_LOAD_PATH = "/api/translate/load";
const PAYMENT_LOAD_PATH = "/api/payment/load";
const PREFERRED_API_BASE_KEY = "k2v_preferred_api_base";
/** 0 = luôn tải lại ip.txt từ GitHub (tránh cache URL backend cũ). */
const SERVER_POOL_CACHE_MS = 0;
let serverPoolCache: { urls: string[]; fetchedAt: number } | null = null;
const LAST_GOOD_POOL_KEY = "k2v_last_good_backend_pool";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const BACKEND_FAILURE_TTL_MS = 10 * 60_000;
const FAILING_BACKENDS_STORAGE_KEY = "k2v_failing_backends";
const failingBackends = new Map<string, number>();

type ServerLoad = {
  active_job_count?: number;
  processing_job_count?: number;
  queued_job_count?: number;
  accepting_new_jobs?: boolean;
  max_concurrent_jobs_per_node?: number;
  node_id?: string;
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

function isBackendPath(path: string): boolean {
  return path.startsWith("/api/") || path.startsWith("/admin/api/");
}

function isPrimaryServerPreferredPath(path: string): boolean {
  return (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/user/") ||
    path === "/api/guest/bootstrap"
  );
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

function loadLastGoodPool(): string[] {
  try {
    const raw = localStorage.getItem(LAST_GOOD_POOL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => (typeof x === "string" ? normalizeBaseUrl(x) : null))
      .filter((x): x is string => Boolean(x));
  } catch {
    return [];
  }
}

function saveLastGoodPool(urls: string[]): void {
  try {
    const uniq = Array.from(new Set(urls)).slice(0, 30);
    if (uniq.length > 0) localStorage.setItem(LAST_GOOD_POOL_KEY, JSON.stringify(uniq));
  } catch {
    // ignore storage issues
  }
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

export function invalidateBackendPoolCache(): void {
  serverPoolCache = null;
}

export async function refreshBackendPoolFromGithub(): Promise<string[]> {
  invalidateBackendPoolCache();
  return getServerPoolUrls(true);
}

async function getServerPoolUrls(forceRefresh = false): Promise<string[]> {
  if (!forceRefresh && serverPoolCache && Date.now() - serverPoolCache.fetchedAt < SERVER_POOL_CACHE_MS) {
    return serverPoolCache.urls;
  }
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
    const out = filtered.length > 0 ? filtered : Array.from(new Set(urls));
    serverPoolCache = { urls: out, fetchedAt: Date.now() };
    saveLastGoodPool(out);
    return out;
  } catch {
    const fallback = loadLastGoodPool();
    if (fallback.length > 0) {
      serverPoolCache = { urls: fallback, fetchedAt: Date.now() };
      return fallback;
    }
    return [];
  }
}

function isStickyTranslatePath(path: string): boolean {
  return (
    path === "/api/translate/status" ||
    path.startsWith("/api/translate/cancel/") ||
    path.startsWith("/api/translate/reconcile/") ||
    path === "/api/video/delete"
  );
}

function getStickyApiBase(): string | null {
  try {
    const raw = sessionStorage.getItem(PREFERRED_API_BASE_KEY);
    if (!raw) return null;
    return normalizeBaseUrl(JSON.parse(raw) as string);
  } catch {
    return null;
  }
}

/** Gọi sau khi POST /api/translate/start trả về api_base_url — ưu tiên cùng máy cho tiến trình / xóa video. */
export function setPreferredApiBaseFromResponse(url: string | null | undefined): void {
  try {
    if (!url || !String(url).trim()) {
      sessionStorage.removeItem(PREFERRED_API_BASE_KEY);
      return;
    }
    const n = normalizeBaseUrl(String(url));
    if (n) sessionStorage.setItem(PREFERRED_API_BASE_KEY, JSON.stringify(n));
  } catch {
    // ignore
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

  // Mobile đôi khi không lấy được ip.txt do mạng/DNS/captive portal.
  // Với backend path mà pool rỗng thì không nên fallback gọi thẳng vào origin của frontend.
  const pool = await getServerPoolUrls(true);
  const orderedBases: string[] = [];
  const preferredBase = normalizeBaseUrl(options?.preferredBaseUrl || "");
  if (preferredBase) orderedBases.push(preferredBase);
  if (isPrimaryServerPreferredPath(path)) {
    const primaryBase = pool[0] ?? "";
    if (primaryBase && !orderedBases.includes(primaryBase)) {
      orderedBases.push(primaryBase);
    }
  }
  for (const base of pool) {
    if (!orderedBases.includes(base)) orderedBases.push(base);
  }
  if (orderedBases.length === 0) {
    throw new Error("Không lấy được danh sách máy chủ backend (ip.txt). Hãy thử tải lại trang hoặc đổi mạng.");
  }

  let lastError: Error | null = null;
  for (const baseUrl of orderedBases) {
    const target = buildTargetUrl(path, baseUrl || null);
    try {
      const response = await fetch(target, init);
      if (!response.ok && shouldRetryResponse(response)) {
        if (baseUrl) markBackendFailure(baseUrl);
        lastError = await parseErrorResponse(response);
        continue;
      }
      if (baseUrl && response.ok) {
        clearBackendFailure(baseUrl);
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

async function getPreferredBackendByLoad(loadPath: string): Promise<string | null> {
  const urls = await getServerPoolUrls(true);
  if (urls.length === 0) return null;

  const loads = await Promise.all(
    urls.map(async (baseUrl, index) => {
      try {
        const response = await fetch(joinUrl(baseUrl, loadPath), {
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
        const accepting = data.accepting_new_jobs !== false;
        clearBackendFailure(baseUrl);
        return { baseUrl, index, activeJobCount, accepting };
      } catch {
        markBackendFailure(baseUrl);
        return null;
      }
    }),
  );

  const available = loads.filter(
    (item): item is { baseUrl: string; index: number; activeJobCount: number; accepting: boolean } =>
      Boolean(item),
  );
  if (available.length === 0) return urls[0];

  const open = available.filter((x) => x.accepting);
  const pool = open.length > 0 ? open : available;
  pool.sort((a, b) => {
    if (a.activeJobCount !== b.activeJobCount) return a.activeJobCount - b.activeJobCount;
    return a.index - b.index;
  });
  return pool[0]?.baseUrl ?? urls[0];
}

async function getTranslationPreferredBackend(path: string): Promise<string | null> {
  if (path === "/api/translate/start") {
    return getPreferredBackendByLoad(TRANSLATE_LOAD_PATH);
  }
  if (path === "/api/payment/create") {
    return getPreferredBackendByLoad(PAYMENT_LOAD_PATH);
  }
  if (path.startsWith("/api/search")) {
    const urls = await getServerPoolUrls(true);
    return urls[0] ?? null;
  }
  if (isStickyTranslatePath(path)) {
    const sticky = getStickyApiBase();
    const urls = await getServerPoolUrls();
    if (sticky) {
      if (urls.length === 0 || urls.includes(sticky)) return sticky;
    }
    return urls[0] ?? null;
  }
  if (isPrimaryServerPreferredPath(path)) {
    const urls = await getServerPoolUrls();
    return urls[0] ?? null;
  }
  const urls = await getServerPoolUrls();
  return urls[0] ?? null;
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
  const response = await fetchWithBackendFallback(
    path,
    {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    { preferredBaseUrl },
  );
  if (!response.ok) {
    throw await parseErrorResponse(response);
  }
  if (response.status === 204) return {} as T;
  const data = (await response.json()) as T;
  if (path === "/api/translate/start" && data && typeof data === "object") {
    const u = (data as { api_base_url?: string }).api_base_url;
    if (typeof u === "string") setPreferredApiBaseFromResponse(u);
  }
  return data;
}
