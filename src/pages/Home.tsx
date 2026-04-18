import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { apiGet, apiPost, apiPostJob } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import type { VideoHit } from "../types";
import { formatRemainingVi } from "../utils/formatRemainingVi";

type Estimate = {
  duration_seconds: number;
  cost_vnd: number;
  is_free_trial: boolean;
  balance_vnd: number;
  sufficient: boolean;
};

type LogoPos = "top_left" | "top_right" | "bottom_left" | "bottom_right";

const LOGO_POS_LABEL: Record<LogoPos, string> = {
  top_left: "Trên trái",
  top_right: "Trên phải",
  bottom_left: "Dưới trái",
  bottom_right: "Dưới phải",
};

function formatVideoDuration(v: VideoHit): string {
  const d = (v.duration || "").trim();
  if (d) return d;
  const sec = v.duration_seconds;
  if (typeof sec === "number" && sec > 0) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return "—";
}

async function blobUrlToDataUrl(url: string): Promise<string> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("Không tải được logo đã lưu");
  const blob = await r.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("Đọc logo thất bại"));
    fr.readAsDataURL(blob);
  });
}

export default function Home() {
  const { t } = useI18n();
  const { user, refreshGuest } = useAuth();
  const [q, setQ] = useState("");
  const [source, setSource] = useState("bilibili");
  const [stype, setStype] = useState<"video" | "channel">("video");
  const [videos, setVideos] = useState<VideoHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [sel, setSel] = useState<VideoHit | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [translator, setTranslator] = useState("google");
  const [targetLang, setTargetLang] = useState("vi");
  const [voice, setVoice] = useState("female");
  const [mirror, setMirror] = useState(true);
  const [vol, setVol] = useState(50);
  const [subSize, setSubSize] = useState(24);
  const [subFg, setSubFg] = useState("#FFFFFF");
  const [subBg, setSubBg] = useState("#000000");
  const [logoScale, setLogoScale] = useState(100);
  const [useLogo, setUseLogo] = useState(false);
  const [logoPosition, setLogoPosition] = useState<LogoPos>("bottom_right");
  const [localLogoDataUrl, setLocalLogoDataUrl] = useState<string | null>(null);
  const [savedLogoUrl, setSavedLogoUrl] = useState<string | null>(null);
  const [previewLayout, setPreviewLayout] = useState<"landscape" | "portrait">("landscape");

  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState("");

  const search = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({
        q: q.trim() || "thịnh hành",
        source,
        type: stype,
      });
      const data = await apiGet<{ videos?: VideoHit[]; error?: string }>(
        `/api/search?${qs}`,
      );
      if (data.error) throw new Error(data.error);
      setVideos(data.videos || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lỗi tìm kiếm");
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [q, source, stype]);

  useEffect(() => {
    setPreviewUrl(null);
    setPreviewErr("");
    setLocalLogoDataUrl(null);
    let cancelled = false;
    if (sel) {
      let dur = (sel.duration || "").trim();
      if (!dur && typeof sel.duration_seconds === "number" && sel.duration_seconds > 0) {
        const m = Math.floor(sel.duration_seconds / 60);
        const s = Math.floor(sel.duration_seconds % 60);
        dur = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      }
      if (!dur) dur = "0";

      const qs = `/api/translate/estimate?duration=${encodeURIComponent(dur)}`;
      apiGet<Estimate>(qs)
        .then((data) => {
          if (!cancelled) setEst(data);
        })
        .catch(() => {
          if (!cancelled) setEst(null);
        });
      if (user) {
        apiGet<{ logo_url: string | null }>("/api/user/logo")
          .then((d) => {
            if (!cancelled) setSavedLogoUrl(d.logo_url || null);
          })
          .catch(() => {
            if (!cancelled) setSavedLogoUrl(null);
          });
      } else {
        setSavedLogoUrl(null);
      }
    } else {
      setEst(null);
      setSavedLogoUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [sel, user]);

  async function loadPreview() {
    if (!sel) return;
    setPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewErr("");
    try {
      const r = await apiPost<{ preview_url?: string }>("/api/video/preview", {
        video_id: sel.video_id,
      });
      setPreviewUrl(r.preview_url || null);
      if (!r.preview_url) setPreviewErr("Không nhận được URL preview.");
    } catch (e: unknown) {
      setPreviewUrl(null);
      setPreviewErr(e instanceof Error ? e.message : "Không tạo được preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function resolveLogoForJob(): Promise<{
    logo_position: string | null;
    channel_logo_data_url: string | null;
  }> {
    if (!useLogo) {
      return { logo_position: null, channel_logo_data_url: null };
    }
    if (localLogoDataUrl) {
      return { logo_position: logoPosition, channel_logo_data_url: localLogoDataUrl };
    }
    if (savedLogoUrl) {
      const dataUrl = await blobUrlToDataUrl(savedLogoUrl);
      return { logo_position: logoPosition, channel_logo_data_url: dataUrl };
    }
    throw new Error(
      user
        ? "Bật chèn logo: hãy chọn ảnh logo hoặc tải logo kênh (Trang Tài khoản)."
        : "Bật chèn logo: hãy chọn ảnh logo trên máy (hoặc đăng nhập để lưu logo kênh).",
    );
  }

  async function onLogoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setLocalLogoDataUrl(null);
      return;
    }
    if (!user) {
      const reader = new FileReader();
      reader.onload = () => setLocalLogoDataUrl(reader.result as string);
      reader.readAsDataURL(file);
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/user/logo", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert((j as { error?: string }).error || "Tải logo thất bại");
      return;
    }
    if ((j as { logo_url?: string }).logo_url) {
      setSavedLogoUrl((j as { logo_url: string }).logo_url);
    }
    const reader = new FileReader();
    reader.onload = () => setLocalLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function startTranslate() {
    if (!sel) return;
    setStarting(true);
    setStartErr("");
    try {
      const logo = await resolveLogoForJob();
      const started = await apiPostJob<{
        estimated_remaining_seconds?: number | null;
      }>("/api/translate/start", {
        video_id: sel.video_id,
        translator,
        target_lang: targetLang,
        voice,
        speed: "+30%",
        mirror_video: mirror,
        original_audio_volume: vol,
        subtitle_font_size: subSize,
        subtitle_text_color: subFg,
        subtitle_background_color: subBg,
        logo_scale_percent: logoScale,
        logo_position: logo.logo_position,
        channel_logo_data_url: logo.channel_logo_data_url,
      });
      setSel(null);
      let msg = "Đã gửi job dịch. Xem mục Tiến trình.";
      if (
        started?.estimated_remaining_seconds != null &&
        started.estimated_remaining_seconds >= 0
      ) {
        msg += ` Dự kiến còn ${formatRemainingVi(started.estimated_remaining_seconds)} nữa là xong.`;
      }
      alert(msg);
      void refreshGuest();
    } catch (e: unknown) {
      setStartErr(e instanceof Error ? e.message : "Không gửi được job");
    } finally {
      setStarting(false);
    }
  }

  const mockSubFont = Math.max(10, Math.round(subSize * (previewLayout === "landscape" ? 0.42 : 0.38)));
  const mockLogoSize = Math.max(20, Math.round(36 * (logoScale / 100)));

  function logoBoxStyle(pos: LogoPos): CSSProperties {
    const pad = 6;
    const s: CSSProperties = {
      position: "absolute",
      width: mockLogoSize,
      height: mockLogoSize,
      borderRadius: 6,
      overflow: "hidden",
      background: "rgba(255,255,255,0.15)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    };
    if (pos === "top_left") return { ...s, top: pad, left: pad };
    if (pos === "top_right") return { ...s, top: pad, right: pad };
    if (pos === "bottom_left") return { ...s, bottom: pad, left: pad };
    return { ...s, bottom: pad, right: pad };
  }

  const logoSrc = localLogoDataUrl || savedLogoUrl || "";

  return (
    <div className="page-enter">
      <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
        {t("home.title")}
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 20 }}>
        {t("home.subtitle")}
      </p>

      <div
        className="card"
        style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 12 }}
      >
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="bilibili">Bilibili</option>
          <option value="douyin">Douyin</option>
        </select>
        <select
          value={stype}
          onChange={(e) => setStype(e.target.value as "video" | "channel")}
        >
          <option value="video">Video</option>
          <option value="channel">Kênh</option>
        </select>
        <input
          style={{ flex: "1 1 200px", minWidth: 200 }}
          placeholder={t("home.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
        />
        <button type="button" className="btn btn-primary" onClick={search} disabled={loading}>
          {loading ? t("home.searching") : t("home.search")}
        </button>
      </div>

      {err && <p className="error-msg">{err}</p>}

      <div className="grid-videos">
        {videos.map((v) => (
          <div
            key={v.video_id}
            className="video-card"
            role="button"
            tabIndex={0}
            onClick={() => setSel(v)}
            onKeyDown={(e) => e.key === "Enter" && setSel(v)}
          >
            <div className="dur-badge" title="Độ dài video gốc">
              {formatVideoDuration(v)}
            </div>
            {v.pic ? (
              <img src={v.pic} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <div
                className="video-thumb-placeholder"
                style={{
                  aspectRatio: "16 / 10",
                  background: "var(--surface2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted)",
                  fontSize: 12,
                }}
              >
                Chưa có ảnh
              </div>
            )}
            <div className="meta">
              <div className="t">{v.title}</div>
              <div className="sub">
                {v.author || "—"} · {formatVideoDuration(v)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {sel && (
        <div className="modal-overlay" role="dialog" aria-modal>
          <div className="modal-box modal-translate">
            <div className="modal-head">
              <h2>Dịch video</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setSel(null)}>
                ✕
              </button>
            </div>
            <p style={{ fontSize: 14, marginBottom: 6 }}>{sel.title}</p>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
              Thời lượng gốc: <strong>{formatVideoDuration(sel)}</strong>
            </p>

            {est && (
              <div
                style={{
                  margin: "12px 0",
                  padding: 12,
                  background: "var(--surface2)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                {est.is_free_trial ? (
                  <strong style={{ color: "var(--ok)" }}>Miễn phí dùng thử (≤2 phút)</strong>
                ) : (
                  <>
                    Chi phí ước tính: <strong>{est.cost_vnd.toLocaleString("vi-VN")}₫</strong>
                    <br />
                    Số dư: {est.balance_vnd.toLocaleString("vi-VN")}₫ —{" "}
                    {est.sufficient ? (
                      <span style={{ color: "var(--ok)" }}>Đủ</span>
                    ) : (
                      <span style={{ color: "var(--err)" }}>Không đủ — hãy nạp tiền</span>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="form-stack" style={{ marginTop: 8 }}>
              <label>
                Engine dịch
                <select
                  value={translator}
                  onChange={(e) => setTranslator(e.target.value)}
                >
                  <option value="google">Google</option>
                  <option value="chatgpt">GPT - dịch đúng ngữ cảnh</option>
                  <option value="gemini">Gemini - dịch bựa</option>
                </select>
              </label>
              <label>
                Ngôn ngữ đích
                <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                Giọng TTS
                <select value={voice} onChange={(e) => setVoice(e.target.value)}>
                  <option value="female">Nữ (VI)</option>
                  <option value="male">Nam (VI)</option>
                  <option value="en-female">English nữ</option>
                  <option value="en-male">English nam</option>
                </select>
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={mirror}
                  onChange={(e) => setMirror(e.target.checked)}
                />
                Lật gương video
              </label>
              <label>
                Âm nền gốc ({vol}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={vol}
                  onChange={(e) => setVol(+e.target.value)}
                />
              </label>
            </div>

            <details className="translate-advanced">
              <summary>Phụ đề, logo &amp; xem trước</summary>
              <div className="form-stack" style={{ marginTop: 12 }}>
                <label>
                  Cỡ phụ đề
                  <input
                    type="range"
                    min={14}
                    max={52}
                    value={subSize}
                    onChange={(e) => setSubSize(+e.target.value)}
                  />
                </label>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <label>
                    Màu chữ
                    <input type="color" value={subFg} onChange={(e) => setSubFg(e.target.value)} />
                  </label>
                  <label>
                    Nền chữ
                    <input type="color" value={subBg} onChange={(e) => setSubBg(e.target.value)} />
                  </label>
                </div>
                <label>
                  Logo scale %
                  <input
                    type="range"
                    min={50}
                    max={150}
                    value={logoScale}
                    onChange={(e) => setLogoScale(+e.target.value)}
                  />
                </label>

                <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={useLogo}
                    onChange={(e) => setUseLogo(e.target.checked)}
                  />
                  Chèn logo kênh (4 góc)
                </label>

                {useLogo && (
                  <>
                    <div className="logo-pos-grid">
                      {(Object.keys(LOGO_POS_LABEL) as LogoPos[]).map((pos) => (
                        <label
                          key={pos}
                          className={`logo-pos-cell ${logoPosition === pos ? "active" : ""}`}
                        >
                          <input
                            type="radio"
                            name="logoPos"
                            checked={logoPosition === pos}
                            onChange={() => setLogoPosition(pos)}
                          />
                          {LOGO_POS_LABEL[pos]}
                        </label>
                      ))}
                    </div>
                    <label>
                      Ảnh logo (PNG/JPG, tùy chọn nếu đã có logo ở Tài khoản)
                      <input type="file" accept="image/*" onChange={onLogoFileChange} />
                    </label>
                  </>
                )}

                <label>
                  Khung xem trước
                  <select
                    value={previewLayout}
                    onChange={(e) =>
                      setPreviewLayout(e.target.value as "landscape" | "portrait")
                    }
                  >
                    <option value="landscape">Ngang (16∶9)</option>
                    <option value="portrait">Dọc (9∶16)</option>
                  </select>
                </label>

                <div
                  className="sub-preview-shell"
                  style={{
                    aspectRatio: previewLayout === "landscape" ? "16 / 9" : "9 / 16",
                    maxHeight: previewLayout === "landscape" ? 260 : 320,
                    marginTop: 8,
                  }}
                >
                  <div
                    className="sub-preview-bg"
                    style={{
                      backgroundImage: sel.pic ? `url(${sel.pic})` : undefined,
                    }}
                  />
                  {useLogo && (
                    <div style={logoBoxStyle(logoPosition)}>
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      ) : (
                        <span style={{ fontSize: 10, color: "#fff" }}>LOGO</span>
                      )}
                    </div>
                  )}
                  <div
                    className="sub-preview-bar"
                    style={{
                      fontSize: mockSubFont,
                      color: subFg,
                      background: subBg,
                    }}
                  >
                    Mẫu phụ đề — kích cỡ tương đối theo cài đặt
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={loadPreview}
                    disabled={previewLoading}
                  >
                    {previewLoading ? "Đang tạo preview…" : "Xem trước 10 giây (video)"}
                  </button>
                </div>
                {previewErr && <p className="error-msg">{previewErr}</p>}
                {previewUrl && (
                  <video
                    key={previewUrl}
                    src={previewUrl}
                    controls
                    playsInline
                    className="preview-video"
                  />
                )}
              </div>
            </details>

            {startErr && <p className="error-msg">{startErr}</p>}
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16, width: "100%" }}
              onClick={startTranslate}
              disabled={
                starting || Boolean(est && !est.sufficient && !est.is_free_trial)
              }
            >
              {starting ? "Đang gửi…" : "Bắt đầu dịch"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
