import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet } from "../api/client";
import { useToast } from "../context/ToastContext";

type OrderRow = {
  id: number;
  user_id: number;
  username: string;
  code: string;
  amount_vnd: number;
  status: string;
  created_at: string | null;
  paid_at: string | null;
};

const STATUS_VI: Record<string, string> = {
  pending: "Chờ CK",
  waiting_approval: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
};

export default function AdminPayments() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ orders: OrderRow[]; total: number }>(
        "/admin/api/payments?limit=100",
      );
      setOrders(d.orders || []);
      setTotal(d.total ?? 0);
      setErr("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lỗi tải");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function del(id: number, status: string) {
    const extra =
      status === "approved"
        ? " Đơn đã duyệt: chỉ xóa bản ghi lịch sử, không hoàn tiền tự động."
        : "";
    if (!confirm(`Xóa đơn này?${extra}`)) return;
    try {
      await apiDelete(`/admin/api/payments/${id}`);
      await load();
      showToast("Đã xóa đơn.", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Lỗi xóa", "warning");
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Đơn nạp tiền</h1>
      <p className="admin-page-desc">
        Tổng <strong>{total}</strong> đơn. Làm mới mỗi 5 giây.
      </p>

      {err && <p className="error-msg">{err}</p>}
      {loading && orders.length === 0 && <p className="muted">Đang tải…</p>}

      <div className="card card-lift admin-table-wrap">
        <table className="data admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Mã</th>
              <th>Số tiền</th>
              <th>Trạng thái</th>
              <th>Tạo lúc</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>
                  <span className="admin-mono">{o.username || o.user_id}</span>
                </td>
                <td className="admin-mono">{o.code}</td>
                <td>{o.amount_vnd.toLocaleString("vi-VN")}₫</td>
                <td>
                  <span className={`status-pill status-${o.status}`}>
                    {STATUS_VI[o.status] || o.status}
                  </span>
                </td>
                <td className="muted small">
                  {o.created_at?.replace("T", " ").slice(0, 19) ?? "—"}
                </td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => del(o.id, o.status)}>
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && !loading && (
          <p className="muted" style={{ padding: 16 }}>
            Chưa có đơn.
          </p>
        )}
      </div>
    </div>
  );
}
