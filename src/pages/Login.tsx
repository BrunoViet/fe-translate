import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function Login() {
  const { login, googleLogin } = useAuth();
  const { showToast } = useToast();
  const nav = useNavigate();
  const [loginVal, setLoginVal] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const gid = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErr("");
    setSubmitting(true);
    try {
      await login(loginVal, password);
      showToast("Đăng nhập thành công.", "success");
      nav("/");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Đăng nhập thất bại";
      setErr(msg);
      showToast(msg, "warning");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page page-enter">
      <div className="auth-card card card-lift">
        <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
          Đăng nhập K2V Media
        </h1>
        <form className="form-stack" onSubmit={onSubmit}>
          <label>
            Email hoặc username
            <input
              value={loginVal}
              onChange={(e) => setLoginVal(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {err && <p className="error-msg">{err}</p>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner sm" /> Đang đăng nhập…
              </>
            ) : (
              "Đăng nhập"
            )}
          </button>
        </form>
        {gid && (
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
            <GoogleLogin
              onSuccess={async (c) => {
                if (submitting) return;
                try {
                  setSubmitting(true);
                  if (c.credential) await googleLogin(c.credential);
                  showToast("Đăng nhập Google thành công.", "success");
                  nav("/");
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "Đăng nhập Google thất bại";
                  setErr(msg);
                  showToast(msg, "warning");
                } finally {
                  setSubmitting(false);
                }
              }}
              onError={() => {
                setErr("Đăng nhập Google thất bại");
                showToast("Đăng nhập Google thất bại", "warning");
              }}
            />
          </div>
        )}
        <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 14 }}>
          Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
        </p>
      </div>
    </div>
  );
}
