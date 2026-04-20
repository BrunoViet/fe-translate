import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useI18n } from "./i18n/I18nContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Jobs from "./pages/Jobs";
import MyVideos from "./pages/MyVideos";
import Payment from "./pages/Payment";
import Spin from "./pages/Spin";
import Tasks from "./pages/Tasks";
import Support from "./pages/Support";
import Legal from "./pages/Legal";
import Account from "./pages/Account";
import AdminLayout from "./components/AdminLayout";
import AdminPayments from "./pages/AdminPayments";
import AdminUsers from "./pages/AdminUsers";
import SupportChatK2V from "./components/SupportChatK2V";

function RequireLogin({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page-loading">{t("common.loading")}</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page-loading">{t("common.loading")}</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/support" element={<Support />} />
        <Route path="/videos" element={<MyVideos />} />
        <Route
          path="/spin"
          element={
            <RequireLogin>
              <Spin />
            </RequireLogin>
          }
        />
        <Route
          path="/tasks"
          element={
            <RequireLogin>
              <Tasks />
            </RequireLogin>
          }
        />
        <Route
          path="/account"
          element={
            <RequireLogin>
              <Account />
            </RequireLogin>
          }
        />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<Navigate to="payments" replace />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <SupportChatK2V />
    </>
  );
}
