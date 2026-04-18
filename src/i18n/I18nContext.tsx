import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { vi } from "./locales/vi";
import { en } from "./locales/en";

export type Locale = "vi" | "en";

const DICTS: Record<Locale, Record<string, string>> = { vi, en };

const STORAGE_KEY = "k2v_locale";

function interpolate(
  template: string,
  vars?: Record<string, string | number | undefined>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v !== undefined && v !== null ? String(v) : `{${k}}`;
  });
}

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number | undefined>) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === "en" || s === "vi") return s;
    } catch {
      /* ignore */
    }
    return "vi";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "vi";
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number | undefined>) => {
      const dict = DICTS[locale];
      const raw = dict[key] ?? DICTS.vi[key] ?? key;
      return interpolate(raw, vars);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
