import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../api';
import { Skeleton, StatusBadge } from '../components/common';
import { date, money, shortId } from '../format';
import { useStore } from '../store';
import NotFound from './NotFound';

// Placed -> Paid -> Shipped, with the date of each step that already happened
function Steps({ order }) {
  const steps = order.canceledAt
    ? [['Placed', order.createdAt], ['Canceled', order.canceledAt]]
    : [['Placed', order.createdAt], ['Paid', order.paidAt], ['Shipped', order.shippedAt]];

  return (
    <ol className={`steps ${order.canceledAt ? 'canceled' : ''}`}>
      {steps.map(([label, when]) => (
        <li key={label} className={when ? 'done' : ''}>
          <span className="step-dot" />
          <strong>{label}</strong>
          <span className="muted small">{when ? date(when) : 'Not yet'}</span>
        </li>
      ))}
    </ol>
  );
}

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

  if (order === undefined) {
    return (
      <div className="order-page stack" aria-busy="true">
        <Skeleton width={220} height={34} />
        <Skeleton height={140} radius={14} />
        <Skeleton height={60} radius={14} />
      </div>
    );
  }
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

      <Steps order={order} />

      {order.status === 'pending' && (
        <div className="actions">
          {order.paymentUrl && <a className="button" href={order.paymentUrl}>Pay now</a>}
          <button className="secondary" onClick={cancel}>Cancel order</button>
        </div>
      )}
    </div>
  );
}
