import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { useToast } from "../context/ToastContext";

type RecentVideo = {
  name: string;
  url: string;
  task_id: string;
  size: string;
  date: string;
  expires_at?: string | null;
  retention_hours?: number;
};

function fmtExpiry(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

type RecentResponse = {
  videos: RecentVideo[];
  total: number;
  offset: number;
  limit: number;
  retention_hours?: number;
};

const PAGE_SIZE = 24;

export default function MyVideos() {
  const { showToast } = useToast();
  const [items, setItems] = useState<RecentVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [retentionH, setRetentionH] = useState(24);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const apiBaseFromVideoUrl = (videoUrl: string): string | null => {
    try {
      const u = new URL(videoUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  };

  const mediaDownloadUrl = (v: RecentVideo): string => {
    const base = apiBaseFromVideoUrl(v.url) || "";
    const path = `${base}/api/video/download/${encodeURIComponent(v.task_id)}`;
    return path;
  };

  const load = useCallback(async (off: number) => {
    setErr("");
    setLoading(true);
    try {
      const d = await apiGet<RecentResponse>(
        `/api/videos/recent?offset=${off}&limit=${PAGE_SIZE}`,
      );
      setItems(d.videos || []);
      setTotal(d.total ?? 0);
      setOffset(d.offset ?? off);
      if (typeof d.retention_hours === "number") setRetentionH(d.retention_hours);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Không tải được danh sách");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  async function onDelete(v: RecentVideo) {
    if (!v.url) return;
    if (deletingTaskId) return;
    if (!confirm("Xóa video đã dịch khỏi máy chủ? Không thể hoàn tác.")) return;
    setDeletingTaskId(v.task_id);
    try {
      await apiPost("/api/video/delete", { video_url: v.url, task_id: v.task_id });
      await load(offset);
      showToast("Đã xóa video trên hệ thống.", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Lỗi", "warning");
    }
    finally {
      setDeletingTaskId(null);
    }
  }

  const hasMore = offset + items.length < total;
  const hasPrev = offset > 0;

  return (
    <div className="page-enter">
      <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
        Video đã dịch
      </h1>
      <div
        className="card card-lift"
        style={{
          marginBottom: 16,
          padding: "12px 16px",
          borderLeft: "4px solid var(--accent)",
          background: "rgba(249, 115, 22, 0.08)",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text)" }}>
          <strong>Lưu ý:</strong> mỗi video sau khi dịch xong chỉ lưu trên hệ thống tối đa{" "}
          <strong>{retentionH} giờ</strong>. Hết thời hạn hệ thống tự xóa file — hãy tải về
          máy trước đó. Bạn cũng có thể xóa sớm bằng nút bên dưới.
        </p>
      </div>
      <p style={{ color: "var(--muted)", marginBottom: 20 }}>
        Danh sách chỉ gồm video còn file — sau khi hết hạn hoặc bạn xóa, dòng sẽ biến mất.
      </p>
      {err && <p className="error-msg">{err}</p>}
      {loading && <p style={{ color: "var(--muted)" }}>Đang tải…</p>}
      {!loading && !err && (
        <>
          <div className="card card-lift" style={{ overflow: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Tên video</th>
                  <th>Thời gian</th>
                  <th>Dung lượng</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.task_id}>
                    <td>{v.name}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--muted)", fontSize: 13 }}>
                      {v.date}
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 13, color: "var(--muted)" }}>
                      {fmtExpiry(v.expires_at)}
                    </td>
                    <td>{v.size}</td>
                    <td>
                      {v.url ? (
                        <>
                          <a
                            href={mediaDownloadUrl(v)}
                            className="btn btn-ghost"
                            style={{ marginRight: 8 }}
                          >
                            Tải xuống
                          </a>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => void onDelete(v)}
                            disabled={Boolean(deletingTaskId)}
                          >
                            {deletingTaskId === v.task_id ? (
                              <>
                                <span className="spinner sm" /> Đang xóa…
                              </>
                            ) : (
                              "Xóa khỏi hệ thống"
                            )}
                          </button>
                        </>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p style={{ color: "var(--muted)", padding: "12px 16px", margin: 0 }}>
                Chưa có video đã dịch nào còn file trên hệ thống.
              </p>
            )}
          </div>
          {(hasPrev || hasMore) && (
            <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!hasPrev || loading}
                onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
              >
                ← Trước
              </button>
              <span style={{ color: "var(--muted)", fontSize: 14 }}>
                {total > 0
                  ? `${offset + 1}–${offset + items.length} / ${total}`
                  : "0 kết quả"}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!hasMore || loading}
                onClick={() => void load(offset + PAGE_SIZE)}
              >
                Sau →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
