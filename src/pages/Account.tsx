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

  // Đã bỏ xác thực email theo yêu cầu.

  useEffect(() => {
    // keep hooks stable (không còn verify email)
  }, []);

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

  void User;

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

      {/* Đã bỏ xác thực email */}
    </div>
  );
}
