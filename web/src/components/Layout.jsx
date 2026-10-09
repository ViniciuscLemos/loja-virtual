import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { api } from '../api';
import { useStore } from '../store';

function VerifyBanner() {
  const { user, notify } = useStore();
  const [sent, setSent] = useState(false);
  if (!user || user.emailVerified) return null;

  async function resend() {
    try {
      await api.post('/auth/resend-verification');
      setSent(true);
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  return (
    <div className="banner">
      Confirm your email to place orders. Check your <Link to="/inbox">inbox</Link>.{' '}
      {sent ? <span>New email sent!</span> : <button className="link" onClick={resend}>Send it again</button>}
    </div>
  );
}

export default function Layout() {
  const { user, cart, config, logout, toast } = useStore();
  const navigate = useNavigate();
  const demo = config.payments === 'demo' || config.email === 'outbox';

  async function onLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="logo">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            Online Store
          </Link>
          <nav>
            <NavLink to="/" end>Shop</NavLink>
            {user && <NavLink to="/orders">Orders</NavLink>}
            {user && config.email === 'outbox' && <NavLink to="/inbox">Inbox</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
            <NavLink to="/cart" className="cart-link">
              Cart{cart.count > 0 && <span className="badge">{cart.count}</span>}
            </NavLink>
            {user ? (
              <button className="link" onClick={onLogout} title={user.email}>Log out</button>
            ) : (
              user === null && <NavLink to="/login">Log in</NavLink>
            )}
          </nav>
        </div>
      </header>

      <VerifyBanner />

      <main className="container">
        <Outlet />
      </main>

      <footer className="container footer">
        {demo && (
          <p>
            Demo mode: {config.payments === 'demo' ? 'payments use a fake checkout' : 'payments go through Stripe'}
            {config.email === 'outbox' && ' and emails show up in the Inbox page instead of being sent'}.
          </p>
        )}
        <p>
          Made by <a href="https://github.com/ViniciuscLemos" target="_blank" rel="noreferrer">Vinicius Lemos</a> ·{' '}
          <a href="https://github.com/ViniciuscLemos/online-store" target="_blank" rel="noreferrer">source code</a>
        </p>
      </footer>

      {toast && <div key={toast.id} className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
