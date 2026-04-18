import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

export default function Account() {
  const { user, refresh } = useAuth();
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [msg, setMsg] = useState("");

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [vEmail, setVEmail] = useState("");
  const [vCode, setVCode] = useState("");
  const [vMsg, setVMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendCooldown, setSendCooldown] = useState(0);

  useEffect(() => {
    if (user?.email) setVEmail(user.email);
  }, [user?.email, verifyOpen]);

  useEffect(() => {
    if (sendCooldown <= 0) return;
    const id = setInterval(() => setSendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [sendCooldown]);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      await apiPost("/api/auth/change-password", {
        current_password: cur,
        new_password: nw,
      });
      setMsg("Đã đổi mật khẩu.");
      setCur("");
      setNw("");
      refresh();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function sendCode() {
    if (!user || sending || sendCooldown > 0) return;
    setVMsg("");
    setSending(true);
    try {
      await apiPost("/api/auth/email/send-code", { email: vEmail.trim().toLowerCase() });
      setVMsg("Đã gửi mã. Kiểm tra hộp thư (và thư mục spam).");
      setSendCooldown(60);
    } catch (e: unknown) {
      setVMsg(e instanceof Error ? e.message : "Không gửi được mã.");
    } finally {
      setSending(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!user || verifying) return;
    setVMsg("");
    const code = vCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setVMsg("Nhập đủ 6 chữ số.");
      return;
    }
    setVerifying(true);
    try {
      const r = await apiPost<{ user: User }>("/api/auth/email/verify-code", {
        email: vEmail.trim().toLowerCase(),
        code,
      });
      if (r.user) {
        await refresh();
      } else {
        await refresh();
      }
      setVerifyOpen(false);
      setVCode("");
      setVMsg("");
    } catch (e: unknown) {
      setVMsg(e instanceof Error ? e.message : "Mã không đúng hoặc đã hết hạn.");
    } finally {
      setVerifying(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page-enter">
      <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
        Tài khoản
      </h1>
      {user.role === "admin" && (
        <p style={{ marginBottom: 16 }}>
          <Link to="/admin/payments" className="muted">
            Quản trị
          </Link>
        </p>
      )}
      <div className="card card-lift" style={{ marginBottom: 20 }}>
        <p>
          <strong>{user.username}</strong> ({user.email})
        </p>
        <p style={{ color: "var(--muted)" }}>Mã giới thiệu: {user.referral_code}</p>
        <p>
          Email:{" "}
          {user.email_verified ? (
            <span style={{ color: "var(--ok)" }}>Đã xác thực</span>
          ) : (
            <>
              <span style={{ color: "var(--err)" }}>Chưa xác thực</span>{" "}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setVerifyOpen(true)}>
                Xác thực email
              </button>
            </>
          )}
        </p>
        <p>Số dư: {user.balance_vnd?.toLocaleString("vi-VN")}₫</p>
      </div>

      <div className="card card-lift">
        <h3 style={{ marginTop: 0 }}>Đổi mật khẩu</h3>
        <form className="form-stack" onSubmit={changePw}>
          <label>
            Mật khẩu hiện tại
            <input
              type="password"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              required
            />
          </label>
          <label>
            Mật khẩu mới
            <input
              type="password"
              value={nw}
              onChange={(e) => setNw(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {msg && <p style={{ color: msg.includes("Lỗi") ? "var(--err)" : "var(--ok)" }}>{msg}</p>}
          <button type="submit" className="btn btn-primary">
            Lưu
          </button>
        </form>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Tài khoản chỉ đăng nhập Google: đổi mật khẩu không áp dụng.
        </p>
      </div>

      {verifyOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => !verifying && !sending && setVerifyOpen(false)}
        >
          <div
            className="modal-box card-lift verify-email-modal"
            role="dialog"
            aria-labelledby="verify-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="verify-title" style={{ marginTop: 0 }}>
              Xác thực email
            </h3>
            <p className="muted small">Nhập email đăng ký và mã 6 số gửi đến hộp thư.</p>
            <form className="form-stack" onSubmit={submitCode}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={vEmail}
                  onChange={(e) => setVEmail(e.target.value)}
                  required
                  disabled={verifying}
                />
              </label>
              <div className="verify-send-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={sending || verifying || sendCooldown > 0}
                  onClick={() => void sendCode()}
                >
                  {sending ? "Đang gửi…" : sendCooldown > 0 ? `Gửi lại sau ${sendCooldown}s` : "Gửi mã"}
                </button>
              </div>
              <label>
                Mã xác thực (6 số)
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="••••••"
                  value={vCode}
                  onChange={(e) => setVCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={verifying}
                  autoComplete="one-time-code"
                />
              </label>
              {vMsg && (
                <p className="small" style={{ color: vMsg.includes("Đã gửi") ? "var(--ok)" : "var(--err)" }}>
                  {vMsg}
                </p>
              )}
              <div className="verify-actions">
                <button type="button" className="btn btn-ghost" disabled={verifying} onClick={() => setVerifyOpen(false)}>
                  Đóng
                </button>
                <button type="submit" className="btn btn-primary" disabled={verifying || vCode.replace(/\D/g, "").length !== 6}>
                  {verifying ? "Đang xác nhận…" : "Xác nhận"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
