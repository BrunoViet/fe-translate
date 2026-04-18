import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer-site">
      <p>
        © {new Date().getFullYear()} <strong>K2V Media</strong> — Dịch &amp; thuyết minh video
        {" · "}
        <Link to="/legal">Điều khoản</Link>
      </p>
    </footer>
  );
}
