import { Navigate, Route, Routes, useLocation } from 'react-router';
import Layout from './components/Layout';
import { useStore } from './store';
import Shop from './pages/Shop';
import ProductPage from './pages/ProductPage';
import Cart from './pages/Cart';
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/Auth';
import Orders from './pages/Orders';
import OrderPage from './pages/OrderPage';
import DemoCheckout from './pages/DemoCheckout';
import Inbox from './pages/Inbox';
import Admin from './pages/admin/Admin';
import NotFound from './pages/NotFound';

// pages that need login send the person to /login and bring them back afterwards
function Private({ children, admin = false }) {
  const { user } = useStore();
  const location = useLocation();
  if (user === undefined) return <p className="muted center">Loading...</p>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== 'admin') return <NotFound />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Shop />} />
        <Route path="products/:slug" element={<ProductPage />} />
        <Route path="cart" element={<Private><Cart /></Private>} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="orders" element={<Private><Orders /></Private>} />
        <Route path="orders/:id" element={<Private><OrderPage /></Private>} />
        <Route path="demo-checkout/:paymentId" element={<Private><DemoCheckout /></Private>} />
        <Route path="inbox" element={<Private><Inbox /></Private>} />
        <Route path="admin/*" element={<Private admin><Admin /></Private>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
