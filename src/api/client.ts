const jsonHeaders = { "Content-Type": "application/json" };
const RAW_SERVER_LIST_URL =
  "https://raw.githubusercontent.com/KNDARK/ip-translate-server/refs/heads/main/ip.txt";
const GITHUB_SERVER_LIST_API_URL =
  "https://api.github.com/repos/KNDARK/ip-translate-server/contents/ip.txt?ref=main";
const TRANSLATE_LOAD_PATH = "/api/translate/load";
const PAYMENT_LOAD_PATH = "/api/payment/load";
// Luôn lấy ip.txt mới nhất trước mỗi API call (không lưu cache IP cũ).
// Lỗi hạ tầng/proxy (Cloudflare 52x/53x), timeout, rate limit... nên failover sang backend khác.
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const BACKEND_FAILURE_TTL_MS = 10 * 60_000;
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

// Không lưu failure cache xuống storage để tránh dính URL cũ giữa các phiên.

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

// Không lưu "last known good pool" để tránh dùng lại IP cũ.

function pruneFailingBackendsAgainstPool(pool: string[]): void {
  try {
    const allowed = new Set(pool);
    let changed = false;
    for (const k of failingBackends.keys()) {
      if (!allowed.has(k)) {
        failingBackends.delete(k);
        changed = true;
      }
    }
    void changed;
  } catch {
    // ignore
  }
}

// Không dùng sticky base URL để tránh dính tunnel cũ.

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchServerListTextWithRetry(): Promise<string> {
  const attempts = 3;
  const waitMs = 10_000;
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchServerListText();
    } catch (e: unknown) {
      lastErr = e;
      if (i < attempts - 1) {
        await sleep(waitMs);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Không lấy được ip.txt từ GitHub.");
}

export function invalidateBackendPoolCache(): void {
  // no-op: giữ lại để tương thích call site
}

export async function refreshBackendPoolFromGithub(): Promise<string[]> {
  invalidateBackendPoolCache();
  return getServerPoolUrls(true);
}

async function getServerPoolUrls(forceRefresh = false): Promise<string[]> {
  // Chặt chẽ: luôn fetch ip.txt mới nhất (forceRefresh kept for API compatibility).
  try {
    const text = await fetchServerListTextWithRetry();
    const urls = parseServerPoolUrls(text);
    const now = Date.now();
    const filtered = Array.from(new Set(urls)).filter((url) => {
      const failedUntil = failingBackends.get(url) ?? 0;
      if (failedUntil > now) return false;
      if (failedUntil > 0) {
        failingBackends.delete(url);
      }
      return true;
    });
    const out = filtered.length > 0 ? filtered : Array.from(new Set(urls));
    pruneFailingBackendsAgainstPool(out);
    return out;
  } catch {
    return [];
  }
}

// Đã bỏ sticky api base URL (không lưu URL/tunnel cũ vào storage).

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
  // Mọi 5xx đều coi là lỗi server/proxy tạm thời -> thử backend khác.
  if (response.status >= 500) return true;
  return RETRYABLE_STATUS_CODES.has(response.status);
}

function markBackendFailure(baseUrl: string): void {
  failingBackends.set(baseUrl, Date.now() + BACKEND_FAILURE_TTL_MS);
}

function clearBackendFailure(baseUrl: string): void {
  failingBackends.delete(baseUrl);
}

async function fetchWithBackendFallback(
  path: string,
  init: RequestInit = {},
  options?: { preferredBaseUrl?: string | null },
): Promise<Response> {
  if (isAbsoluteHttpUrl(path) || !isBackendPath(path)) {
    return fetch(path, init);
  }

  // Đa backend: ưu tiên lấy pool từ ip.txt (GitHub).
  // Nhưng nếu pool không lấy được (mạng/captive portal/GitHub chặn) thì vẫn cần fallback
  // về same-origin để hỗ trợ deploy kiểu Vercel rewrite/proxy.
  let pool: string[] = [];
  try {
    pool = await getServerPoolUrls(true);
  } catch {
    pool = [];
  }
  const orderedBases: string[] = [];
  const preferredBase = normalizeBaseUrl(options?.preferredBaseUrl || "");
  // Không dùng sticky/preferredBase để tránh dính tunnel/IP cũ.
  if (preferredBase && pool.length > 0 && pool.includes(preferredBase)) orderedBases.push(preferredBase);
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
    // Fallback: gọi thẳng relative path (same-origin). Nếu bạn deploy có reverse proxy
    // (ví dụ vercel.json) thì login/payment/logo vẫn chạy được.
    try {
      return await fetch(path, init);
    } catch (e: unknown) {
      throw new Error(
        e instanceof Error
          ? `Không kết nối được backend (pool rỗng + same-origin fail): ${e.message}`
          : "Không kết nối được backend (pool rỗng + same-origin fail).",
      );
    }
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

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const preferredBaseUrl = await getTranslationPreferredBackend(path);
  const response = await fetchWithBackendFallback(
    path,
    {
      method: "POST",
      credentials: "include",
      body: form,
    },
    { preferredBaseUrl },
  );
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
  if (isPrimaryServerPreferredPath(path)) {
    const urls = await getServerPoolUrls(true);
    return urls[0] ?? null;
  }
  const urls = await getServerPoolUrls(true);
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
  return (await response.json()) as T;
}
