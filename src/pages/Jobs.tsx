import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../api/client";
import { useI18n } from "../i18n/I18nContext";
import { useToast } from "../context/ToastContext";

type Task = {
  id: string;
  title: string;
  status: string;
  cost_vnd: number;
  output_url: string | null;
  error_detail: string | null;
  created_at: string | null;
  updated_at?: string | null;
  progress_percent?: number | null;
};

const TERMINAL = new Set(["completed", "error", "cancelled", "interrupted"]);

function jobStatusKey(status: string): string {
  const s = String(status || "").toLowerCase();
  if (
    [
      "queued",
      "processing",
      "downloading",
      "extracting",
      "transcribing",
      "translating",
      "tts",
      "syncing",
      "muxing",
      "completed",
      "error",
      "cancelled",
      "interrupted",
    ].includes(s)
  ) {
    return s;
  }
  return "processing";
}

export default function Jobs() {
  const { t, locale } = useI18n();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const numLocale = locale === "en" ? "en-US" : "vi-VN";

  const load = () => {
    apiGet<{ tasks: Task[] }>("/api/translate/status")
      .then((d) => setTasks(d.tasks || []))
      .catch((e: Error) => setErr(e.message));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const statusLabel = useMemo(
    () => (raw: string) => t(`jobStatus.${jobStatusKey(raw)}`),
    [t],
  );

  async function cancel(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await apiPost(`/api/translate/cancel/${id}`);
      load();
      showToast("Đã gửi yêu cầu hủy.", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t("common.error"), "warning");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCompletedVideo(outputUrl: string, taskId: string) {
    if (!confirm(t("jobs.confirmDelete"))) return;
    if (busyId) return;
    setBusyId(taskId);
    try {
      await apiPost("/api/video/delete", { video_url: outputUrl, task_id: taskId });
      load();
      showToast("Đã xóa video trên server.", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : t("common.error"), "warning");
    } finally {
      setBusyId(null);
    }
  }

  // Đã bỏ nút hoàn / hoàn tiền khi treo trên client theo yêu cầu.

  function isActiveJob(tk: Task): boolean {
    return !TERMINAL.has(String(tk.status || "")) && tk.status !== "completed";
  }

  return (
    <div className="page-enter jobs-page">
      <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
        {t("jobs.title")}
      </h1>
      <p style={{ color: "var(--muted)" }} className="jobs-intro">
        {t("jobs.introBefore")}
        <Link to="/videos">{t("nav.videos")}</Link>
        {t("jobs.introAfter")}
      </p>
      <aside className="jobs-policy-note" role="note">
        {t("jobs.refundNote")}
      </aside>
      {err && <p className="error-msg">{err}</p>}
      <div className="card card-lift jobs-table-wrap">
        <table className="data jobs-responsive">
          <thead>
            <tr>
              <th>{t("jobs.colVideo")}</th>
              <th>{t("jobs.colStatus")}</th>
              <th>{t("jobs.colProgress")}</th>
              <th>{t("jobs.colCost")}</th>
              <th>{t("jobs.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((tk) => {
              const pct =
                typeof tk.progress_percent === "number"
                  ? Math.min(100, Math.max(0, tk.progress_percent))
                  : 0;
              return (
                <tr key={tk.id}>
                  <td data-label={t("jobs.colVideo")}>{tk.title}</td>
                  <td data-label={t("jobs.colStatus")}>{statusLabel(tk.status)}</td>
                  <td data-label={t("jobs.colProgress")}>
                    <span className="jobs-pct">{pct}%</span>
                  </td>
                  <td data-label={t("jobs.colCost")}>
                    {tk.cost_vnd?.toLocaleString(numLocale)}₫
                  </td>
                  <td data-label={t("jobs.colActions")}>
                    {tk.status === "completed" ? (
                      tk.output_url ? (
                        <>
                          <a
                            href={tk.output_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost"
                            style={{ marginRight: 8 }}
                          >
                            {t("jobs.download")}
                          </a>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => deleteCompletedVideo(tk.output_url!, tk.id)}
                            disabled={busyId === tk.id}
                          >
                            {busyId === tk.id ? (
                              <>
                                <span className="spinner sm" /> {t("common.loading")}
                              </>
                            ) : (
                              t("jobs.deleteVideo")
                            )}
                          </button>
                        </>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>{t("jobs.fileDeleted")}</span>
                      )
                    ) : (
                      <>
                        {tk.output_url && (
                          <a href={tk.output_url} target="_blank" rel="noreferrer">
                            {t("jobs.downloadShort")}
                          </a>
                        )}
                        {isActiveJob(tk) && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ marginLeft: 8 }}
                            onClick={() => cancel(tk.id)}
                            disabled={busyId === tk.id}
                          >
                            {busyId === tk.id ? (
                              <>
                                <span className="spinner sm" /> {t("common.loading")}
                              </>
                            ) : (
                              t("jobs.cancel")
                            )}
                          </button>
                        )}
                        {/* Đã bỏ nút hoàn / hoàn tiền khi treo */}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {tasks.length === 0 && !err && (
          <p style={{ color: "var(--muted)" }}>{t("jobs.empty")}</p>
        )}
      </div>
    </div>
  );
}
