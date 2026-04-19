import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet, apiPost, apiPostForm } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n/I18nContext";

type Pkg = { id: string; amount_vnd: number; label: string };
type Plan = {
  id: string;
  amount_vnd: number;
  label: string;
  duration_days: number;
  badge?: string;
  bullets?: string[];
};

type PayOrder = {
  code: string;
  amount_vnd: number;
  status: string;
  created_at: string | null;
  paid_at: string | null;
  has_proof?: boolean;
};

type OrderDetail = {
  code: string;
  amount_vnd: number;
  order_type?: string;
  plan_id?: string | null;
  plan_duration_days?: number | null;
  status: string;
  qr_url: string;
  bank_account: string;
  bank_name: string;
  account_holder: string;
  has_proof?: boolean;
};

function errFromBody(data: unknown): string {
  const d = data as { detail?: unknown; error?: string };
  if (typeof d.error === "string") return d.error;
  if (typeof d.detail === "string") return d.detail;
  return "";
}

export default function Payment() {
  const { t } = useI18n();
  const { refresh, refreshGuest, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<PayOrder[]>([]);
  const [sel, setSel] = useState<Pkg | null>(null);
  const [selPlan, setSelPlan] = useState<Plan | null>(null);
  const [mode, setMode] = useState<"topup" | "subscription">("topup");
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [bank, setBank] = useState({ account: "", name: "", holder: "" });
  const [status, setStatus] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancellingCode, setCancellingCode] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    await refresh();
    await refreshGuest();
  }, [refresh, refreshGuest]);

  const loadHistory = useCallback(async () => {
    try {
      const d = await apiGet<{ orders: PayOrder[] }>("/api/payment/history?limit=30");
      setHistory(d.orders || []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    apiGet<{ packages: Pkg[]; subscription_plans?: Plan[] }>("/api/payment/packages")
      .then((d) => {
        setPackages(d.packages || []);
        setPlans(d.subscription_plans || []);
      })
      .catch(() => {
        setPackages([]);
        setPlans([]);
      });
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "subscription" && user) {
      setMode("subscription");
    }
  }, [searchParams, user]);

  useEffect(() => {
    if (!user && mode === "subscription") {
      setMode("topup");
    }
  }, [user, mode]);

  function clearProof() {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(null);
    setProofPreview(null);
  }

  /** Chọn lại đơn pending / chờ duyệt — tải QR + trạng thái mới nhất */
  async function loadOrderByCode(code: string) {
    try {
      const o = await apiGet<OrderDetail>(`/api/payment/order/${code}`);
      setOrderCode(o.code);
      setQr(o.qr_url || "");
      setBank({
        account: o.bank_account,
        name: o.bank_name,
        holder: o.account_holder,
      });
      setStatus(o.status);
      clearProof();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Không mở được đơn");
    }
  }

  useEffect(() => {
    if (!orderCode) return;
    const tick = async () => {
      try {
        const r = await fetch(`/api/payment/check/${encodeURIComponent(orderCode)}`, {
          credentials: "include",
        });
        if (r.status === 404) {
          setOrderCode(null);
          setQr("");
          setStatus("");
          clearProof();
          loadHistory();
          return;
        }
        if (!r.ok) return;
        const c = (await r.json()) as { status: string };
        setStatus((prev) => {
          const next = c.status;
          if (prev !== next && (next === "approved" || next === "rejected")) {
            void refreshAll();
            loadHistory();
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [orderCode, refreshAll, loadHistory]);

  async function createOrder() {
    if (mode === "subscription" && !user) {
      alert("Đăng nhập để mua gói thành viên (tháng / năm).");
      return;
    }
    if (mode === "topup") {
      if (!sel) return;
    } else {
      if (!selPlan) return;
    }
    clearProof();
    try {
      const r = await apiPost<{
        order_code: string;
        qr_url: string;
        bank_account: string;
        bank_name: string;
        account_holder: string;
      }>("/api/payment/create", {
        kind: mode,
        package_id: mode === "topup" ? sel?.id : undefined,
        plan_id: mode === "subscription" ? selPlan?.id : undefined,
      });
      setOrderCode(r.order_code);
      setQr(r.qr_url || "");
      setBank({
        account: r.bank_account,
        name: r.bank_name,
        holder: r.account_holder,
      });
      setStatus("pending");
      loadHistory();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Lỗi tạo đơn");
    }
  }

  async function cancelOrder(code: string) {
    if (cancellingCode) return;
    if (!window.confirm("Hủy đơn này? Bạn có thể tạo đơn thanh toán mới sau.")) return;
    setCancellingCode(code);
    try {
      await apiPost<{ ok: boolean; deleted?: boolean }>(
        `/api/payment/cancel/${encodeURIComponent(code)}`
      );
      if (orderCode === code) {
        setOrderCode(null);
        setQr("");
        setStatus("");
        clearProof();
      }
      await loadHistory();
      await refreshAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Không hủy được đơn");
    } finally {
      setCancellingCode(null);
    }
  }

  async function confirmPaid() {
    if (!orderCode || confirming) return;
    if (status !== "pending") {
      alert('Chỉ bấm "Đã chuyển khoản" khi đơn đang ở trạng thái "Chờ CK".');
      return;
    }
    setConfirming(true);
    try {
      const form = new FormData();
      if (proofFile) form.append("proof", proofFile);
      await apiPostForm(`/api/payment/confirm/${encodeURIComponent(orderCode)}`, form);
      setStatus("waiting_approval");
      clearProof();
      void refreshAll();
      loadHistory();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setConfirming(false);
    }
  }

  function onProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    if (!f) {
      setProofFile(null);
      setProofPreview(null);
      return;
    }
    setProofFile(f);
    setProofPreview(URL.createObjectURL(f));
  }

  return (
    <div className="page-enter">
      <h1 className="page-title-gradient">{t("payment.title")}</h1>
      <p style={{ color: "var(--muted)", maxWidth: 720, textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
        {t("payment.intro")}
      </p>

      <div className="pay-mode-tabs">
        <button
          type="button"
          className={`pay-tab ${mode === "topup" ? "active" : ""}`}
          onClick={() => {
            setMode("topup");
            setSelPlan(null);
            setOrderCode(null);
            setQr("");
            setStatus("");
            clearProof();
          }}
        >
          Nạp tiền
        </button>
        {user && (
          <button
            type="button"
            className={`pay-tab ${mode === "subscription" ? "active" : ""}`}
            onClick={() => {
              setMode("subscription");
              setSel(null);
              setOrderCode(null);
              setQr("");
              setStatus("");
              clearProof();
            }}
          >
            Gói thành viên
          </button>
        )}
      </div>
      {!user && (
        <p style={{ color: "var(--muted)", textAlign: "center", marginTop: 8, fontSize: 14 }}>
          Bạn đang nạp vào <strong>số dư khách</strong> (cookie trình duyệt).{" "}
          <strong>Đăng nhập</strong> là bắt buộc để mua gói Pro (tháng / năm).
        </p>
      )}

      {mode === "topup" && (
        <div className="pkg-row">
          {packages.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pkg-chip ${sel?.id === p.id ? "active" : ""}`}
              onClick={() => {
                setSel(p);
                setOrderCode(null);
                setQr("");
                setStatus("");
                clearProof();
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {mode === "subscription" && (
        <div className="plan-grid">
          {plans.map((pl) => (
            <button
              key={pl.id}
              type="button"
              className={`plan-card ${selPlan?.id === pl.id ? "active" : ""}`}
              onClick={() => {
                setSelPlan(pl);
                setOrderCode(null);
                setQr("");
                setStatus("");
                clearProof();
              }}
            >
              <div className="plan-head">
                <div className="plan-title">{pl.label}</div>
                {pl.badge && <span className="plan-badge">{pl.badge}</span>}
              </div>
              <div className="plan-price">
                {pl.amount_vnd.toLocaleString("vi-VN")}₫
                <span className="plan-sub">/{Math.round((pl.duration_days || 30) / 30)} tháng</span>
              </div>
              <ul className="plan-bullets">
                {(pl.bullets || []).slice(0, 4).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <div className="plan-cta">{selPlan?.id === pl.id ? "Đã chọn" : "Chọn gói"}</div>
            </button>
          ))}
          {plans.length === 0 && (
            <p className="muted" style={{ textAlign: "center" }}>
              Chưa có gói thành viên.
            </p>
          )}
        </div>
      )}

      {((mode === "topup" && sel) || (mode === "subscription" && selPlan)) && !orderCode && (
        <button type="button" className="btn btn-primary btn-bounce" onClick={createOrder}>
          Tạo mã thanh toán
        </button>
      )}

      {orderCode && (
        <div className="card card-lift pay-active-card pay-order-panel">
          <p className="pay-order-code-line">
            Mã thanh toán
            <br />
            <strong className="pay-order-code accent-text">{orderCode}</strong>
          </p>
          <p className="pay-bank-line">
            {bank.name} — {bank.account} — {bank.holder}
          </p>
          {qr && (
            <div className="pay-qr-wrap">
              <img src={qr} alt="Mã QR thanh toán" className="pay-qr-img" />
            </div>
          )}

          {status === "pending" && (
            <>
              <div className="pay-proof-note">
                Có thể tải ảnh biên lai chuyển khoản (bill, sao kê). Không có ảnh vẫn gửi xác nhận, thời gian xử lý có
                thể lâu hơn. Nếu bạn đính kèm ảnh, ảnh đó sẽ được dùng làm bằng chứng thay cho mã QR trên.
              </div>
              <label className="pay-proof-label">
                Ảnh bằng chứng (tuỳ chọn, tối đa 5MB — JPG, PNG, WEBP)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={onProofChange}
                />
              </label>
              {proofPreview && (
                <div className="pay-proof-preview">
                  <img src={proofPreview} alt="Bằng chứng" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearProof}>
                    Gỡ ảnh
                  </button>
                </div>
              )}
            </>
          )}

          <p>
            Trạng thái:{" "}
            <span className={`status-pill status-${status}`}>
              {status === "pending" && "Chờ CK"}
              {status === "waiting_approval" && "Đang xử lý"}
              {status === "approved" && "Đã duyệt"}
              {status === "rejected" && "Từ chối"}
              {status === "cancelled" && "Đã hủy"}
              {!["pending", "waiting_approval", "approved", "rejected", "cancelled"].includes(
                status
              ) && status}
            </span>
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary btn-bounce"
              onClick={confirmPaid}
              disabled={status !== "pending" || confirming}
            >
              {confirming ? "Đang gửi…" : "Đã chuyển khoản"}
            </button>
            {status === "pending" && orderCode && !confirming && (
              <button
                type="button"
                className="pay-cancel-btn"
                disabled={!!cancellingCode}
                onClick={() => void cancelOrder(orderCode)}
              >
                {cancellingCode === orderCode ? "Đang hủy…" : "Hủy đơn"}
              </button>
            )}
          </div>
          {status === "waiting_approval" && (
            <p className="muted small" style={{ marginTop: 8 }}>
              Đã ghi nhận. Trang sẽ tự cập nhật khi có kết quả.
            </p>
          )}
        </div>
      )}

      <div className="card card-lift" style={{ marginTop: 32 }}>
        <h3 style={{ marginTop: 0 }}>Đơn của bạn (bấm dòng để mở lại)</h3>
        <table className="data pay-history-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Số tiền</th>
              <th>Trạng thái</th>
              <th>CK</th>
              <th>Thời gian</th>
              <th style={{ width: 100 }}> </th>
            </tr>
          </thead>
          <tbody>
            {history.map((o) => (
              <tr
                key={o.code}
                className={`pay-row-select ${orderCode === o.code ? "selected" : ""} ${
                  o.status === "pending" || o.status === "waiting_approval" ? "clickable" : ""
                }`}
                onClick={() => {
                  if (o.status === "pending" || o.status === "waiting_approval") {
                    void loadOrderByCode(o.code);
                  }
                }}
                style={{
                  cursor:
                    o.status === "pending" || o.status === "waiting_approval"
                      ? "pointer"
                      : "default",
                }}
              >
                <td className="mono">{o.code}</td>
                <td>{o.amount_vnd?.toLocaleString("vi-VN")}₫</td>
                <td>
                  <span className={`status-pill status-${o.status}`}>
                    {o.status === "pending" && "Chờ CK"}
                    {o.status === "waiting_approval" && "Đang xử lý"}
                    {o.status === "approved" && "Đã duyệt"}
                    {o.status === "rejected" && "Từ chối"}
                    {o.status === "cancelled" && "Đã hủy"}
                    {![
                      "pending",
                      "waiting_approval",
                      "approved",
                      "rejected",
                      "cancelled",
                    ].includes(o.status) && o.status}
                  </span>
                </td>
                <td className="small">
                  {o.has_proof ? (
                    <span className="status-pill status-approved">Có ảnh</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{o.created_at?.replace("T", " ").slice(0, 19)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {o.status === "pending" && !(confirming && orderCode === o.code) ? (
                    <button
                      type="button"
                      className="pay-cancel-btn"
                      disabled={!!cancellingCode}
                      onClick={() => void cancelOrder(o.code)}
                    >
                      {cancellingCode === o.code ? "…" : "Hủy đơn"}
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && <p style={{ color: "var(--muted)" }}>Chưa có đơn.</p>}
      </div>
    </div>
  );
}
