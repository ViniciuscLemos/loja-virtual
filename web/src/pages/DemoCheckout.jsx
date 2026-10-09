import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { money, shortId } from '../format';
import NotFound from './NotFound';

// Stands in for Stripe's payment page when the store runs without Stripe keys.
export default function DemoCheckout() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/demo-checkout/${paymentId}`)
      .then((r) => setOrder(r.order))
      .catch(() => setOrder(null));
  }, [paymentId]);

  async function pay() {
    setBusy(true);
    try {
      await api.post(`/demo-checkout/${paymentId}/pay`);
      navigate(`/orders/${order.id}?paid=1`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (order === undefined) return <p className="muted center">Loading...</p>;
  if (order === null) return <NotFound />;

  return (
    <div className="checkout card">
      <p className="demo-tag">Demo checkout · no real money</p>
      <h1>Pay {money(order.totalCents)}</h1>
      <p className="muted">Order #{shortId(order.id)}</p>
      <ul className="order-items">
        {order.items.map((i) => (
          <li key={i.productId} className="row-between">
            <span>{i.quantity}x {i.name}</span>
            <span>{money(i.unitPriceCents * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="fake-card">
        <span>4242 4242 4242 4242</span>
        <span className="muted small">12/34 · 123</span>
      </div>
      {error && <p className="error-box small">{error}</p>}
      {order.status === 'pending' ? (
        <button className="full" onClick={pay} disabled={busy}>
          {busy ? 'Paying...' : `Pay ${money(order.totalCents)}`}
        </button>
      ) : (
        <p className="muted">This checkout is already closed.</p>
      )}
      <p className="small center">
        <Link to={`/orders/${order.id}`}>Back to the order</Link>
      </p>
      <p className="muted small">
        With Stripe keys set on the server, this step is Stripe's real checkout page and the payment is confirmed by a webhook.
      </p>
    </div>
  );
}
