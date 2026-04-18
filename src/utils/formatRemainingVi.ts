/** Hiển thị thời gian còn lại (ước lượng), không phải mốc giờ tuyệt đối. */
export function formatRemainingVi(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const sec = Math.max(0, Math.floor(seconds));
  if (sec < 60) return `~${sec} giây`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) {
    return s > 0 ? `~${m} phút ${s} giây` : `~${m} phút`;
  }
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `~${h} giờ ${rm} phút` : `~${h} giờ`;
}
