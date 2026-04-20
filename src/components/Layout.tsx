import { useEffect, useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import { useToast } from "../context/ToastContext";
import { apiPost, invalidateBackendPoolCache } from "../api/client";
import Footer from "./Footer";
import NotificationBell from "./NotificationBell";
import CompletionSuccessModal from "./CompletionSuccessModal";

function fmtDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const loc = locale === "en" ? "en-US" : "vi-VN";
    return d.toLocaleString(loc, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function Layout() {
  const { t, locale, setLocale } = useI18n();
  const numLocale = locale === "en" ? "en-US" : "vi-VN";
  const { user, logout, refresh, refreshGuest, guestBalanceVnd } = useAuth();
  const { showToast } = useToast();
  const [hideExpiredBanner, setHideExpiredBanner] = useState(false);
  const [subDetailOpen, setSubDetailOpen] = useState(false);

  useEffect(() => {
    setHideExpiredBanner(false);
  }, [user?.id, user?.subscription_expires_at, user?.subscription_status]);

  useEffect(() => {
    if (!user || user.subscription_status !== "expired") return;
    const key = `sub_exp_dismiss:${user.id}`;
    try {
      const v = localStorage.getItem(key);
      if (user.subscription_expires_at && v === user.subscription_expires_at) {
        setHideExpiredBanner(true);
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        invalidateBackendPoolCache();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onVis);
    };
  }, []);

  useEffect(() => {
    const onFocus = () => {
      invalidateBackendPoolCache();
      void refresh();
      void refreshGuest();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, refreshGuest]);

  const dismissExpiredBanner = () => {
    if (user?.subscription_expires_at) {
      try {
        localStorage.setItem(`sub_exp_dismiss:${user.id}`, user.subscription_expires_at);
      } catch {
        /* ignore */
      }
    }
    setHideExpiredBanner(true);
  };

  const showSubBadge =
    user?.subscription_active && user.subscription_plan_label;
  const showExpiredBanner =
    user?.subscription_status === "expired" && !hideExpiredBanner;

  return (
    <div className="layout">
      <header className="topnav">
        <NavLink to="/" className="brand">
          K2V<span>Media</span>
        </NavLink>
        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.find")}
          </NavLink>
          <NavLink to="/jobs" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.jobs")}
          </NavLink>
          <NavLink to="/videos" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.videos")}
          </NavLink>
          <NavLink to="/payment" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.payment")}
          </NavLink>
          <NavLink to="/spin" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.spin")}
          </NavLink>
          <NavLink to="/tasks" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.tasks")}
          </NavLink>
          <NavLink to="/support" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.support")}
          </NavLink>
          <NavLink to="/account" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("nav.account")}
          </NavLink>
        </nav>
        <div className="topnav-actions">
          <label className="sr-only" htmlFor="k2v-lang">
            Language
          </label>
          <select
            id="k2v-lang"
            className="lang-select"
            value={locale}
            onChange={(e) => setLocale(e.target.value as "vi" | "en")}
            aria-label="Language"
          >
            <option value="vi">{t("lang.vi")}</option>
            <option value="en">{t("lang.en")}</option>
          </select>
          {user ? (
            <>
              <NotificationBell />
              {showSubBadge && (
                <button
                  type="button"
                  className="sub-badge"
                  title="Xem chi tiết gói Pro"
                  onClick={() => setSubDetailOpen(true)}
                >
                  Pro · {user.subscription_plan_label}
                </button>
              )}
              <span className="balance-pill">
                {(user.balance_vnd ?? 0).toLocaleString(numLocale)}₫
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <>
              {guestBalanceVnd != null && (
                <span
                  className="balance-pill"
                  title="Số dư khi dùng không đăng nhập (cookie trình duyệt)"
                >
                  {t("nav.guestBalance", {
                    amount: guestBalanceVnd.toLocaleString(numLocale),
                  })}
                </span>
              )}
              <Link to="/login" className="btn btn-ghost">
                {t("nav.login")}
              </Link>
              <Link to="/register" className="btn btn-primary">
                {t("nav.register")}
              </Link>
            </>
          )}
        </div>
      </header>
      {subDetailOpen && user?.subscription_active && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="sub-detail-title"
          onClick={() => setSubDetailOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setSubDetailOpen(false)}
        >
          <div
            className="modal-box card-lift"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="sub-detail-title">Gói K2V Pro</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSubDetailOpen(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "0 4px 12px", color: "var(--text)" }}>
              <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 14 }}>
                {user.subscription_plan_title || `K2V Pro · ${user.subscription_plan_label ?? ""}`}
              </p>
              <dl className="sub-detail-dl">
                <dt>Hiệu lực từ</dt>
                <dd>{fmtDateTime(user.subscription_period_started_at, locale)}</dd>
                <dt>Đến hạn</dt>
                <dd>{fmtDateTime(user.subscription_expires_at, locale)}</dd>
                <dt>Thanh toán gần nhất</dt>
                <dd>{fmtDateTime(user.subscription_last_paid_at, locale)}</dd>
                {(user.subscription_plan_amount_vnd != null ||
                  user.subscription_plan_duration_days != null) && (
                  <>
                    <dt>Phí &amp; thời hạn đăng ký</dt>
                    <dd>
                      {user.subscription_plan_amount_vnd != null
                        ? `${user.subscription_plan_amount_vnd.toLocaleString("vi-VN")}₫`
                        : "—"}
                      {user.subscription_plan_duration_days != null
                        ? ` · ${user.subscription_plan_duration_days} ngày`
                        : ""}
                    </dd>
                  </>
                )}
              </dl>
              {(() => {
                const lines =
                  user.subscription_privileges && user.subscription_privileges.length > 0
                    ? user.subscription_privileges
                    : user.subscription_plan_bullets || [];
                if (lines.length === 0) return null;
                return (
                  <>
                    <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Quyền lợi gói</h3>
                    <ul className="sub-detail-ul">
                      {lines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </>
                );
              })()}
              <p style={{ marginTop: 14, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                <strong>Hủy gói</strong> sẽ kết thúc Pro ngay. Không hoàn tiền tự động cho thời gian còn lại — nếu cần
                theo chính sách, hãy liên hệ{" "}
                <Link to="/support" onClick={() => setSubDetailOpen(false)}>
                  Hỗ trợ
                </Link>
                .
              </p>
              <div
                className="sub-detail-actions"
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 14,
                  alignItems: "center",
                }}
              >
                <Link
                  to="/payment?mode=subscription"
                  className="btn btn-primary"
                  onClick={() => setSubDetailOpen(false)}
                >
                  Gia hạn
                </Link>
                <Link
                  to="/payment?mode=subscription"
                  className="btn btn-accent-outline"
                  onClick={() => setSubDetailOpen(false)}
                >
                  Đổi gói
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    void (async () => {
                      if (
                        !confirm(
                          "Hủy gói Pro ngay? Ưu đãi Pro sẽ kết thúc lập tức. Không hoàn tiền tự động cho thời gian còn lại.",
                        )
                      ) {
                        return;
                      }
                      try {
                        await apiPost("/api/auth/subscription/cancel");
                        showToast("Đã hủy gói Pro.", "success");
                        setSubDetailOpen(false);
                        await refresh();
                      } catch (e: unknown) {
                        showToast(e instanceof Error ? e.message : "Không hủy được gói", "warning");
                      }
                    })();
                  }}
                >
                  Hủy gói
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showExpiredBanner && (
        <div className="sub-expired-banner" role="alert">
          <p>
            Gói thành viên của bạn đã hết hạn. Gia hạn để tiếp tục dịch tối đa 3 video cùng lúc và được ưu tiên xử lý.
          </p>
          <div className="sub-expired-banner-actions">
            <Link to="/payment" className="btn btn-primary btn-sm">
              Gia hạn gói
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismissExpiredBanner}>
              Đã hiểu
            </button>
          </div>
        </div>
      )}
      <main>
        <Outlet />
      </main>
      {user && <CompletionSuccessModal />}
      <Footer />
    </div>
  );
}
