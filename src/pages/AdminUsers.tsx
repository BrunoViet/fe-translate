import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api/client";

type UserRow = {
  id: number;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  balance_vnd: number;
  ip_address: string | null;
  email_verified: boolean;
  created_at: string | null;
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: "80", q });
      const d = await apiGet<{ users: UserRow[]; total: number }>(
        `/admin/api/users?${qs}`,
      );
      setUsers(d.users || []);
      setTotal(d.total ?? 0);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(u: UserRow) {
    setAdjustAmount("");
    setAdjustReason("");
    try {
      const fresh = await apiGet<{ user: UserRow }>(`/admin/api/users/${u.id}`);
      setDetail(fresh.user);
      setEditName(fresh.user.username);
    } catch {
      setDetail(u);
      setEditName(u.username);
    }
  }

  async function saveEdit() {
    if (!detail) return;
    try {
      await apiPatch(`/admin/api/users/${detail.id}`, { username: editName.trim() });
      await load();
      setDetail(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function toggleLock() {
    if (!detail) return;
    try {
      await apiPost(`/admin/api/users/${detail.id}/toggle-active`, {});
      await load();
      const fresh = await apiGet<{ user: UserRow }>(`/admin/api/users/${detail.id}`);
      setDetail(fresh.user);
      setEditName(fresh.user.username);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function applyAdjust() {
    if (!detail) return;
    const raw = adjustAmount.trim().replace(/\s/g, "").replace(/\./g, "");
    const sign = raw.startsWith("-") ? -1 : 1;
    const n = sign * parseInt(raw.replace(/^-/, ""), 10);
    if (Number.isNaN(n) || n === 0) {
      alert("Nhập số tiền điều chỉnh (VND), có thể âm");
      return;
    }
    try {
      await apiPost(`/admin/api/users/${detail.id}/adjust-balance`, {
        amount: n,
        reason: adjustReason || "Điều chỉnh số dư",
      });
      await load();
      const fresh = await apiGet<{ user: UserRow }>(`/admin/api/users/${detail.id}`);
      setDetail(fresh.user);
      setAdjustAmount("");
      setAdjustReason("");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Lỗi");
    }
  }

  async function removeUser() {
    if (!detail) return;
    if (!confirm(`Xóa vĩnh viễn user ${detail.username}? Không thể hoàn tác.`)) return;
    try {
      await apiDelete(`/admin/api/users/${detail.id}`);
      setDetail(null);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Lỗi xóa");
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Người dùng</h1>
      <p className="admin-page-desc">
        Tổng <strong>{total}</strong> tài khoản.
      </p>

      <div className="card card-lift" style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Tìm email / username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: 200 }}
        />
        <button type="button" className="btn btn-primary" onClick={() => load()}>
          Lọc
        </button>
      </div>

      {loading && users.length === 0 && <p className="muted">Đang tải…</p>}

      <div className="card card-lift admin-table-wrap">
        <table className="data admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Email</th>
              <th>Số dư</th>
              <th>IP</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td className="small">{u.email}</td>
                <td>{u.balance_vnd.toLocaleString("vi-VN")}₫</td>
                <td className="admin-mono small">{u.ip_address || "—"}</td>
                <td>
                  {u.is_active ? (
                    <span className="status-pill status-approved">Hoạt động</span>
                  ) : (
                    <span className="status-pill status-rejected">Khóa</span>
                  )}
                </td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDetail(u)}>
                    Chi tiết
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="modal-overlay" role="dialog" aria-modal>
          <div className="modal-box admin-user-modal card-lift">
            <div className="modal-head">
              <h2>User #{detail.id}</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setDetail(null)}>
                ✕
              </button>
            </div>
            <dl className="admin-dl">
              <dt>Email</dt>
              <dd>{detail.email}</dd>
              <dt>IP đăng ký</dt>
              <dd className="admin-mono">{detail.ip_address || "—"}</dd>
              <dt>Số dư</dt>
              <dd>{detail.balance_vnd.toLocaleString("vi-VN")}₫</dd>
              <dt>Vai trò</dt>
              <dd>{detail.role}</dd>
              <dt>Email xác thực</dt>
              <dd>{detail.email_verified ? "Có" : "Chưa"}</dd>
              <dt>Tạo lúc</dt>
              <dd>{detail.created_at?.replace("T", " ").slice(0, 19)}</dd>
            </dl>

            <div className="form-stack" style={{ marginTop: 16 }}>
              <label>
                Chỉnh username
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <button type="button" className="btn btn-primary" onClick={saveEdit}>
                Lưu username
              </button>
            </div>

            <div className="form-stack" style={{ marginTop: 16 }}>
              <label>
                Điều chỉnh số dư (VND, + hoặc -)
                <input
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="vd: 50000 hoặc -10000"
                />
              </label>
              <label>
                Lý do
                <input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
              </label>
              <button type="button" className="btn btn-primary" onClick={applyAdjust}>
                Áp dụng số dư
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
              <button type="button" className="btn btn-ghost" onClick={toggleLock}>
                {detail.is_active ? "Khóa tài khoản" : "Mở khóa"}
              </button>
              {detail.role !== "admin" && (
                <button type="button" className="btn btn-ghost" style={{ color: "var(--err)" }} onClick={removeUser}>
                  Xóa user
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
