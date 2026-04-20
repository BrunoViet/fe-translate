import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Prize = { label: string; vnd: number };

const SEG_COLORS = [
  "#e11d48",
  "#db2777",
  "#9333ea",
  "#2563eb",
  "#059669",
  "#ca8a04",
];

export default function Spin() {
  const { user, refresh } = useAuth();
  const [can, setCan] = useState(false);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const rotRef = useRef(0);

  const load = () => {
    setInitLoading(true);
    apiGet<{ can_spin: boolean; prizes: Prize[] }>("/api/spin/status")
      .then((d) => {
        setCan(d.can_spin);
        setPrizes(d.prizes || []);
      })
      .catch(() => {});
      .finally(() => setInitLoading(false));
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  function buildConicGradient(n: number): string {
    const step = 360 / n;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = i * step;
      const a1 = (i + 1) * step;
      const c = SEG_COLORS[i % SEG_COLORS.length];
      parts.push(`${c} ${a0}deg ${a1}deg`);
    }
    return `conic-gradient(from -90deg, ${parts.join(", ")})`;
  }

  async function spin() {
    if (!prizes.length) return;
    setLoading(true);
    setSpinning(true);
    setResult(null);
    try {
      const r = await apiPost<{
        prize_label: string;
        prize_vnd: number;
        prize_index: number;
      }>("/api/spin");
      const n = prizes.length;
      const idx = typeof r.prize_index === "number" ? r.prize_index : 0;
      const segmentAngle = 360 / n;
      const centerAngle = (idx + 0.5) * segmentAngle;
      const spins = 6;
      const delta = spins * 360 + (360 - centerAngle);
      rotRef.current += delta;
      setRotation(rotRef.current);
      await new Promise((res) => setTimeout(res, 4200));
      setResult(
        `${r.prize_label}${r.prize_vnd > 0 ? ` (+${r.prize_vnd.toLocaleString("vi-VN")}₫)` : ""}`,
      );
      await refresh();
      load();
    } catch (e: unknown) {
      setResult(e instanceof Error ? e.message : "Không quay được");
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }

  const n = Math.max(prizes.length, 1);

  return (
    <div className="page-enter spin-page">
      <h1 className="page-title-gradient">Vòng quay may mắn</h1>
      <p style={{ color: "var(--muted)" }}>Mỗi ngày một lượt — bấm QUAY để xem vòng quay dừng ở ô tương ứng.</p>

      {initLoading && <p style={{ color: "var(--muted)" }}>Đang tải…</p>}
      <div className="spin-stage">
        <div className="spin-pointer" aria-hidden />
        <div
          className={`spin-wheel ${spinning ? "is-spinning" : ""}`}
          style={{
            transform: `rotate(${rotation}deg)`,
            background: buildConicGradient(n),
          }}
        >
          <div className="spin-wheel-label-layer" aria-hidden>
            {prizes.map((p, i) => {
              const angleDeg = (i + 0.5) * (360 / n) - 90;
              const rad = (angleDeg * Math.PI) / 180;
              const r = 36;
              const left = 50 + r * Math.cos(rad);
              const top = 50 + r * Math.sin(rad);
              const short =
                p.label.length > 16 ? `${p.label.slice(0, 14)}…` : p.label;
              return (
                <span
                  key={`${p.label}-${i}`}
                  className="spin-lbl"
                  style={{ left: `${left}%`, top: `${top}%` }}
                  title={`${p.label}${p.vnd > 0 ? ` (${p.vnd.toLocaleString("vi-VN")}₫)` : ""}`}
                >
                  <span className="spin-lbl-name">{short}</span>
                  {p.vnd > 0 && (
                    <span className="spin-lbl-amt">{p.vnd.toLocaleString("vi-VN")}₫</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="spin-center-btn"
          disabled={!can || loading || initLoading}
          onClick={spin}
        >
          {loading ? "…" : "QUAY"}
        </button>
      </div>

      {!can && (
        <p style={{ color: "var(--muted)", textAlign: "center" }}>
          Hôm nay bạn đã quay rồi. Quay lại vào ngày mai.
        </p>
      )}
      {result && <p className="spin-result-pop">{result}</p>}

      <div className="card card-lift" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Các phần thưởng trên vòng</h3>
        <ul className="spin-legend">
          {prizes.map((p, i) => (
            <li key={`${p.label}-${i}`}>
              <span
                className="spin-swatch"
                style={{ background: SEG_COLORS[i % SEG_COLORS.length] }}
              />
              {p.label}
              {p.vnd > 0 ? ` — ${p.vnd.toLocaleString("vi-VN")}₫` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
