import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "../api/client";

const PRESETS = [
  "Cách tạo tài khoản và đăng nhập?",
  "Sau khi chuyển khoản nạp tiền, bao lâu thì được cộng số dư?",
  "Chính sách hoàn tiền khi dịch video bị lỗi hoặc thất bại?",
  "Làm sao để tìm video và bắt đầu dịch?",
  "Số dư và giao dịch xem ở đâu?",
];

type Msg = { role: "user" | "assistant"; text: string };

export default function SupportChatK2V() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollBottom();
  }, [msgs, open, scrollBottom]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || loading || cooldown > 0) return;
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setLoading(true);
    try {
      const r = await apiPost<{ ok?: boolean; reply?: string; error?: string }>(
        "/api/support/chat",
        { message: t },
      );
      const reply = r.reply || "Không có phản hồi.";
      setMsgs((m) => [...m, { role: "assistant", text: reply }]);
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : "Lỗi";
      setMsgs((m) => [...m, { role: "assistant", text: err }]);
    } finally {
      setLoading(false);
      setCooldown(3);
    }
  }

  return (
    <>
      <button
        type="button"
        className="k2v-chat-fab"
        aria-label="Mở hỗ trợ K2VAI"
        onClick={() => setOpen((v) => !v)}
      >
        K2VAI
      </button>

      {open && (
        <div className="k2v-chat-panel card-lift" role="dialog" aria-label="K2VAI hỗ trợ">
          <div className="k2v-chat-head">
            <span className="k2v-chat-title">Hỗ trợ K2VAI</span>
            <button type="button" className="k2v-chat-close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="k2v-chat-presets">
            {PRESETS.map((q) => (
              <button
                key={q}
                type="button"
                className="k2v-preset-chip"
                disabled={loading}
                onClick={() => send(q)}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="k2v-chat-messages">
            {msgs.length === 0 && (
              <p className="k2v-chat-hint">Chọn câu hỏi gợi ý hoặc nhập nội dung bên dưới.</p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`k2v-msg k2v-msg-${m.role}`}>
                {m.text}
              </div>
            ))}
            {loading && <div className="k2v-msg k2v-msg-assistant k2v-msg-typing">Đang trả lời…</div>}
            <div ref={endRef} />
          </div>
          <form
            className="k2v-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              type="text"
              placeholder="Nhập câu hỏi…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              maxLength={2000}
            />
            <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
              {cooldown > 0 ? `Chờ ${cooldown}s` : "Gửi"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
