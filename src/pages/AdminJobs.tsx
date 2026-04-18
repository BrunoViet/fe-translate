import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../api/client";

type JobRow = {
  id: number;
  user_id: number;
  task_id: string;
  video_title: string;
  cost_vnd: number;
  status: string;
  worker_id: string | null;
  created_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Hàng đợi",
  processing: "Xử lý",
  downloading: "Tải",
  extracting: "Tách audio",
  transcribing: "Nhận dạng",
  translating: "Dịch",
  tts: "TTS",
  syncing: "Đồng bộ",
  muxing: "Mux",
  completed: "Xong",
  error: "Lỗi",
  cancelled: "Đã hủy",
};

export default function AdminJobs() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const load = useCallback(async () => {
    try {
      const q = activeOnly ? "?limit=100&active_only=true" : "?limit=100";
      const d = await apiGet<{ jobs: JobRow[]; total: number }>(`/admin/api/jobs${q}`);
      setJobs(d.jobs || []);
      setTotal(d.total ?? 0);
      setErr("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lỗi tải");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Tiến trình dịch (toàn hệ thống)</h1>
      <p className="admin-page-desc">
        Tổng khớp bộ lọc: <strong>{total}</strong> job. Làm mới mỗi 4 giây.
      </p>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => setActiveOnly(e.target.checked)}
        />
        Chỉ job đang chạy / hàng đợi
      </label>

      {err && <p className="error-msg">{err}</p>}
      {loading && jobs.length === 0 && <p className="muted">Đang tải…</p>}

      <div className="card card-lift admin-table-wrap">
        <table className="data admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Video</th>
              <th>Trạng thái</th>
              <th>Worker</th>
              <th>Chi phí</th>
              <th>Tạo lúc</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td>
                  <span className="admin-mono">{j.user_id}</span>
                </td>
                <td style={{ maxWidth: 280 }} title={j.video_title}>
                  <span className="admin-mono" style={{ fontSize: 11 }}>
                    {j.task_id?.slice(0, 8)}…
                  </span>
                  <br />
                  <span style={{ fontSize: 13 }}>{j.video_title?.slice(0, 80) || "—"}</span>
                </td>
                <td>
                  <span className={`status-pill status-${j.status}`}>
                    {STATUS_LABEL[j.status] || j.status}
                  </span>
                </td>
                <td className="admin-mono muted small">{j.worker_id || "—"}</td>
                <td>{j.cost_vnd?.toLocaleString("vi-VN")}₫</td>
                <td className="muted small">
                  {j.created_at?.replace("T", " ").slice(0, 19) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && !loading && (
          <p className="muted" style={{ padding: 16 }}>
            Không có job.
          </p>
        )}
      </div>
    </div>
  );
}
