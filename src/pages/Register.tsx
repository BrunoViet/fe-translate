import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const refDefault = params.get("ref") || "";

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState(refDefault);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await register({
        email,
        username,
        password,
        referral_code: referral.trim() || undefined,
      });
      nav("/");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Đăng ký thất bại");
    }
  }

  return (
    <div className="auth-page page-enter">
      <div className="auth-card card card-lift">
        <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
          Đăng ký
        </h1>
        <form className="form-stack" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Username (3–30 ký tự)
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Mật khẩu (≥ 6 ký tự)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Mã giới thiệu (tuỳ chọn)
            <input
              value={referral}
              onChange={(e) => setReferral(e.target.value)}
              placeholder="Mã người giới thiệu"
            />
          </label>
          {err && <p className="error-msg">{err}</p>}
          <button type="submit" className="btn btn-primary">
            Tạo tài khoản
          </button>
        </form>
        <p style={{ marginTop: 20, color: "var(--muted)", fontSize: 14 }}>
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
