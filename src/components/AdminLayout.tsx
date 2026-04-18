import { NavLink, Outlet, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark">K2V</span>
          <span className="admin-brand-sub">Quản trị</span>
        </div>
        <nav className="admin-nav">
          <NavLink
            to="/admin/payments"
            className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}
          >
            Đơn nạp tiền
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}
          >
            Người dùng
          </NavLink>
        </nav>
        <div className="admin-sidebar-foot">
          <Link to="/" className="admin-back-site">
            ← Về trang chính
          </Link>
          <span className="admin-user-mini">{user?.username}</span>
          <button type="button" className="btn btn-ghost btn-block-admin" onClick={() => logout()}>
            Đăng xuất
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}
