import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, googleLogin } = useAuth();
  const nav = useNavigate();
  const [loginVal, setLoginVal] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const gid = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await login(loginVal, password);
      nav("/");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Đăng nhập thất bại");
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
          <button type="submit" className="btn btn-primary">
            Đăng nhập
          </button>
        </form>
        {gid && (
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
            <GoogleLogin
              onSuccess={async (c) => {
                try {
                  if (c.credential) await googleLogin(c.credential);
                  nav("/");
                } catch (e: unknown) {
                  setErr(e instanceof Error ? e.message : "Google lỗi");
                }
              }}
              onError={() => setErr("Đăng nhập Google thất bại")}
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
