import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../types";
import { apiGet, apiPost, clearPaymentBackendSticky } from "../api/client";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  /** Số dư cookie khách (không đăng nhập); cập nhật qua refreshGuest /api/guest/bootstrap */
  guestBalanceVnd: number | null;
  refresh: () => Promise<void>;
  refreshGuest: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  register: (p: {
    email: string;
    username: string;
    password: string;
    referral_code?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestBalanceVnd, setGuestBalanceVnd] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const u = await apiGet<User>("/api/auth/me");
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  const refreshGuest = useCallback(async () => {
    try {
      const d = await apiGet<{ balance_vnd: number }>("/api/guest/bootstrap");
      setGuestBalanceVnd(d.balance_vnd);
    } catch {
      setGuestBalanceVnd(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([refresh(), refreshGuest()]).finally(() => setLoading(false));
  }, [refresh, refreshGuest]);

  const login = async (loginVal: string, password: string) => {
    await apiPost<{ user: User }>("/api/auth/login", {
      login: loginVal,
      password,
    });
    await refresh();
    await refreshGuest();
  };

  const register = async (p: {
    email: string;
    username: string;
    password: string;
    referral_code?: string;
  }) => {
    await apiPost("/api/auth/register", p);
    await refresh();
    await refreshGuest();
  };

  const logout = async () => {
    await apiPost("/api/auth/logout");
    clearPaymentBackendSticky();
    setUser(null);
    await refreshGuest();
  };

  const googleLogin = async (idToken: string) => {
    await apiPost("/api/auth/google", { id_token: idToken });
    await refresh();
    await refreshGuest();
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        guestBalanceVnd,
        refresh,
        refreshGuest,
        login,
        register,
        logout,
        googleLogin,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
