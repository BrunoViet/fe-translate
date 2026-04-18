import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { useAuth } from "../context/AuthContext";

type NotifItem = {
  id: number;
  title: string;
  body: string;
  kind: string | null;
  read: boolean;
  created_at: string | null;
};

function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    if (!user) return;
    try {
      const d = await apiGet<{ items: NotifItem[]; unread_count: number }>("/api/notifications");
      setItems(d.items || []);
      setUnread(d.unread_count ?? 0);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    load();
    const onDoc = (e: MouseEvent) => {
      const root = document.getElementById("notif-dropdown-root");
      if (root && !root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) return null;

  async function onRowClick(n: NotifItem) {
    if (!n.read) {
      try {
        await apiPost(`/api/notifications/${n.id}/read`);
      } catch {
        /* ignore */
      }
    }
    await load();
  }

  async function readAll() {
    try {
      await apiPost("/api/notifications/read-all");
    } catch {
      /* ignore */
    }
    await load();
  }

  return (
    <div id="notif-dropdown-root" className="notif-wrap">
      <button
        type="button"
        className="notif-bell-btn btn btn-ghost"
        aria-label="Thông báo"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="notif-bell-ico" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        {unread > 0 && (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="notif-panel card-lift" role="menu">
          <div className="notif-panel-head">
            <span>Thông báo</span>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void readAll()}>
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          <div className="notif-panel-body">
            {items.length === 0 ? (
              <p className="notif-empty">Chưa có thông báo.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-row${n.read ? "" : " notif-row-unread"}`}
                  onClick={() => void onRowClick(n)}
                >
                  <div className="notif-row-title">{n.title}</div>
                  {n.body ? <div className="notif-row-body">{n.body}</div> : null}
                  <div className="notif-row-time">{fmtShort(n.created_at)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
