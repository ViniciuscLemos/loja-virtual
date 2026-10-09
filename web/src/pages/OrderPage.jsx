import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../api';
import { StatusBadge } from '../components/common';
import { date, money, shortId } from '../format';
import { useStore } from '../store';
import NotFound from './NotFound';

export default function OrderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { refreshCart, notify } = useStore();
  const [order, setOrder] = useState(undefined);

  const load = useCallback(
    () =>
      api
        .get(`/orders/${id}`)
        .then((r) => setOrder(r.order))
        .catch(() => setOrder(null)),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  // back from Stripe the webhook may take a second to arrive, so it checks again a few times
  const justPaid = params.get('paid') === '1';
  useEffect(() => {
    if (!justPaid || order?.status !== 'pending') return;
    const timer = setTimeout(load, 1500);
    return () => clearTimeout(timer);
  }, [justPaid, order, load]);

  useEffect(() => {
    if (order?.status === 'paid') refreshCart();
  }, [order?.status, refreshCart]);

  async function cancel() {
    if (!confirm('Cancel this order? The items go back to the store.')) return;
    try {
      setOrder((await api.post(`/orders/${id}/cancel`)).order);
      notify('Order canceled.');
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  if (order === undefined) return <p className="muted center">Loading...</p>;
  if (order === null) return <NotFound />;

  return (
    <div className="order-page">
      <Link to="/orders" className="muted small">← My orders</Link>
      <div className="row-between">
        <h1>Order #{shortId(order.id)}</h1>
        <StatusBadge status={order.status} />
      </div>

      {justPaid && order.status === 'paid' && <p className="success-box">Payment confirmed! We sent you an email with the details.</p>}
      {justPaid && order.status === 'pending' && <p className="muted">Confirming the payment...</p>}

      <div className="card">
        <ul className="order-items">
          {order.items.map((i) => (
            <li key={i.productId} className="row-between">
              <span>{i.quantity}x {i.name}</span>
              <span>{money(i.unitPriceCents * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="row-between total">
          <span>Total</span>
          <strong>{money(order.totalCents)}</strong>
        </div>
      </div>

      <ul className="timeline muted small">
        <li>Placed on {date(order.createdAt)}</li>
        {order.paidAt && <li>Paid on {date(order.paidAt)}</li>}
        {order.shippedAt && <li>Shipped on {date(order.shippedAt)}</li>}
        {order.canceledAt && <li>Canceled on {date(order.canceledAt)}</li>}
      </ul>

      {order.status === 'pending' && (
        <div className="actions">
          {order.paymentUrl && <a className="button" href={order.paymentUrl}>Pay now</a>}
          <button className="secondary" onClick={cancel}>Cancel order</button>
        </div>
      )}
    </div>
  );
}
