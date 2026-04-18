# K2V Media — Frontend (Vercel)

Bản tách riêng từ monorepo `AutoTranslateVideo` chỉ để deploy static lên Vercel.

## Triển khai

1. Đưa folder này lên GitHub/GitLab hoặc kết nối trực tiếp repo chứa folder này với Vercel.
2. **Build:** `npm run build` — **Output:** `dist` (Vercel thường tự nhận Vite).
3. Cài dependency: `npm ci` hoặc `npm install` (Vercel chạy tự động).

## Biến môi trường

- Sao chép `.env.example` thành `.env.local` khi dev local.
- Trên Vercel, thêm các biến tương ứng trong **Project → Settings → Environment Variables** (nếu project có dùng `VITE_*`).

## SPA (React Router)

File `vercel.json` đã cấu hình rewrite về `index.html` để route dạng `/jobs`, `/payment` hoạt động sau khi build.

## Backend

API không nằm trên Vercel; app gọi backend qua URL trong pool (`client.ts` + GitHub `ip.txt`). Đảm bảo backend public có **CORS** và **cookie** phù hợp với domain Vercel của bạn.
