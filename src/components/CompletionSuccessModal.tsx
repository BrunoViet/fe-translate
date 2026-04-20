import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

type RecentRow = {
  name: string;
  url: string;
  task_id: string;
};

const STORAGE_KEY = "k2v_completion_modal_tasks";

function loadShownIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markShown(id: string) {
  const s = loadShownIds();
  s.add(id);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}

/**
 * Theo dõi /api/videos/recent — task_id mới → toast + modal (mỗi task một lần / phiên).
 */
export default function CompletionSuccessModal() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [queue, setQueue] = useState<RecentRow[]>([]);
  const [modal, setModal] = useState<RecentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      primedRef.current = false;
      prevIdsRef.current.clear();
      setQueue([]);
      setModal(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const d = await apiGet<{ videos: RecentRow[] }>("/api/videos/recent?limit=40&offset=0");
        if (cancelled) return;
        const videos = d.videos || [];

        if (!primedRef.current) {
          prevIdsRef.current = new Set(videos.map((v) => v.task_id));
          primedRef.current = true;
          return;
        }

        const newcomers = videos.filter((v) => !prevIdsRef.current.has(v.task_id));
        prevIdsRef.current = new Set(videos.map((v) => v.task_id));

        const toAdd: RecentRow[] = [];
        for (const v of newcomers) {
          if (loadShownIds().has(v.task_id)) continue;
          markShown(v.task_id);
          showToast(`Đã dịch xong: ${v.name || "Video"}`, "success");
          toAdd.push(v);
        }
        if (toAdd.length > 0) {
          setQueue((q) => [...q, ...toAdd]);
        }
      } catch {
        /* ignore */
      }
    };

    const id = window.setInterval(run, 5000);
    void run();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.id, showToast]);

  useEffect(() => {
    if (modal) return;
    if (queue.length === 0) return;
    const [first, ...rest] = queue;
    setModal(first);
    setQueue(rest);
  }, [modal, queue]);

  async function handleDelete() {
    if (!modal?.url) return;
    if (deleting) return;
    if (!confirm("Xóa video đã dịch khỏi máy chủ? Không thể hoàn tác.")) return;
    setDeleting(true);
    try {
      await apiPost("/api/video/delete", {
        video_url: modal.url,
        task_id: modal.task_id,
      });
      setModal(null);
      showToast("Đã xóa video trên server.", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Lỗi", "warning");
    } finally {
      setDeleting(false);
    }
  }

  function handleClose() {
    setModal(null);
  }

  if (!user || !modal) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal
      aria-labelledby="completion-modal-title"
      onClick={handleClose}
      onKeyDown={(e) => e.key === "Escape" && handleClose()}
    >
      <div
        className="modal-box card-lift"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="completion-modal-title">Dịch xong</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <p style={{ margin: "0 0 16px", color: "var(--text)", lineHeight: 1.5 }}>
          <strong>{modal.name || "Video"}</strong> đã sẵn sàng. Tải về hoặc xóa trên server — file tự xóa sau 24h
          nếu bạn không tải (xem mục Video đã dịch).
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {modal.url ? (
            <a href={modal.url} target="_blank" rel="noreferrer" className="btn btn-primary">
              Tải xuống
            </a>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? (
              <>
                <span className="spinner sm" /> Đang xóa…
              </>
            ) : (
              "Xóa trên server"
            )}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
