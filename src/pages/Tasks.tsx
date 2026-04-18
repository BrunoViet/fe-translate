import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

type Task = {
  id: string;
  title: string;
  reward_vnd: number;
  completed: boolean;
  referral_code?: string;
};

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    apiGet<{ tasks: Task[] }>("/api/tasks").then((d) => setTasks(d.tasks || []));
  }, []);

  const refTask = tasks.find((t) => t.id === "referral");
  const link = refTask?.referral_code
    ? `${origin}/register?ref=${encodeURIComponent(refTask.referral_code)}`
    : "";

  return (
    <div className="page-enter">
      <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
        Nhiệm vụ
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {tasks.map((t) => (
          <div key={t.id} className="card card-lift">
            <strong>{t.title}</strong>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>
              Thưởng: {t.reward_vnd.toLocaleString("vi-VN")}₫ —{" "}
              {t.completed ? (
                <span style={{ color: "var(--ok)" }}>Hoàn thành</span>
              ) : (
                <span>Chưa xong</span>
              )}
            </div>
            {t.id === "referral" && link && (
              <div style={{ marginTop: 8 }}>
                <input
                  readOnly
                  value={link}
                  style={{ width: "100%", fontSize: 13 }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => navigator.clipboard.writeText(link)}
                >
                  Copy link giới thiệu
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
