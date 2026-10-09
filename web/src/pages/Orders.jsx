import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { StatusBadge } from '../components/common';
import { date, money, shortId } from '../format';

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/orders').then((r) => setOrders(r.orders)).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error-box">{error}</p>;
  if (!orders) return <p className="muted center">Loading...</p>;

  return (
    <>
      <h1>My orders</h1>
      {orders.length === 0 && (
        <p className="muted">
          No orders yet. Find something in the <Link to="/">shop</Link>.
        </p>
      )}
      <ul className="order-list">
        {orders.map((o) => (
          <li key={o.id}>
            <Link to={`/orders/${o.id}`} className="card order-row">
              <div>
                <strong>Order #{shortId(o.id)}</strong>
                <p className="muted small">{date(o.createdAt)} · {o.items.reduce((n, i) => n + i.quantity, 0)} items</p>
              </div>
              <StatusBadge status={o.status} />
              <strong>{money(o.totalCents)}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
