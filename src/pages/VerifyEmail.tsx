import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../api/client";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [msg, setMsg] = useState("Đang xác thực…");
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      setOk(false);
      setMsg("Thiếu token.");
      return;
    }
    apiGet<{ ok?: boolean; message?: string }>(
      `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
    )
      .then((r) => {
        setOk(true);
        setMsg(r.message || "Email đã được xác thực.");
      })
      .catch((e: Error) => {
        setOk(false);
        setMsg(e.message);
      });
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 style={{ marginTop: 0 }}>Xác thực email</h1>
        <p style={{ color: ok === false ? "var(--err)" : "var(--muted)" }}>{msg}</p>
        <p>
          <Link to="/">Về trang chủ</Link>
        </p>
      </div>
    </div>
  );
}
