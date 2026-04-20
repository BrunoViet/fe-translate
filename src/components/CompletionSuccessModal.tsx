import { useEffect, useRef } from "react";
import { apiGet } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const STORAGE_KEY = "k2v_completion_toast_tasks";

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

type RecentRow = { name: string; task_id: string };

/**
 * Theo dõi /api/videos/recent — task hoàn thành mới → chỉ toast (không modal).
 */
export default function CompletionSuccessModal() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const prevIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      primedRef.current = false;
      prevIdsRef.current.clear();
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

        for (const v of newcomers) {
          if (loadShownIds().has(v.task_id)) continue;
          markShown(v.task_id);
          showToast(
            `Đã dịch xong: ${v.name || "Video"}. Xem tại mục Video đã dịch.`,
            "success",
          );
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

  return null;
}
