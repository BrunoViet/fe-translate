export default function Legal() {
  return (
    <div className="page-enter">
      <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
        Điều khoản &amp; chính sách
      </h1>
      <div className="card card-lift" style={{ maxWidth: 720, margin: "0 auto", textAlign: "left" }}>
        <h2 style={{ marginTop: 0 }}>Sử dụng dịch vụ</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.65 }}>
          K2V Media cung cấp công cụ dịch và thuyết minh video từ các nguồn do bạn chỉ định. Bạn chịu
          trách nhiệm đảm bảo mình có quyền sử dụng nội dung gốc theo luật bản quyền và điều khoản
          của từng nền tảng (Bilibili, Douyin, …).
        </p>
        <h2>Thanh toán &amp; hoàn tiền</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.65 }}>
          Nạp tiền và gói thành viên được xử lý theo xác nhận chuyển khoản thủ công qua kênh đã công
          bố. Yêu cầu hoàn tiền hoặc khiếu nại liên hệ hỗ trợ — chúng tôi xem xét theo từng trường hợp
          và chính sách đang áp dụng tại thời điểm yêu cầu.
        </p>
        <h2>Bảo mật</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.65 }}>
          Thông tin đăng nhập và phiên làm việc được bảo vệ theo chuẩn phổ biến (HTTPS khi bật chế độ
          production). Không chia sẻ tài khoản cho bên thứ ba.
        </p>
        <p style={{ marginTop: 24, fontSize: 14, color: "var(--muted)" }}>
          Nội dung trang có thể được cập nhật. Tiếp tục sử dụng dịch vụ sau khi thay đổi nghĩa là bạn
          đã nắm và chấp nhận bản mới nhất.
        </p>
      </div>
    </div>
  );
}
