import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Pagination, StatusBadge } from '../../components/common';
import { date, money, shortId } from '../../format';
import { useStore } from '../../store';

export default function AdminOrders() {
  const { notify } = useStore();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    const query = new URLSearchParams({ page });
    if (status) query.set('status', status);
    api.get(`/admin/orders?${query}`).then(setData).catch((e) => notify(e.message, 'error'));
  }, [status, page, notify]);

  useEffect(() => {
    load();
  }, [load]);

  async function ship(order) {
    try {
      await api.post(`/admin/orders/${order.id}/ship`);
      notify(`Order #${shortId(order.id)} marked as shipped. The customer got an email.`);
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  return (
    <>
      <div className="filters">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">All orders</option>
          <option value="paid">Paid (to ship)</option>
          <option value="pending">Waiting for payment</option>
          <option value="shipped">Shipped</option>
          <option value="canceled">Canceled</option>
        </select>
      </div>

      {!data ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td><strong>#{shortId(o.id)}</strong><br /><span className="muted small">{date(o.createdAt)}</span></td>
                  <td>{o.customer.name}<br /><span className="muted small">{o.customer.email}</span></td>
                  <td className="small">{o.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</td>
                  <td>{money(o.totalCents)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{o.status === 'paid' && <button className="small-button" onClick={() => ship(o)}>Mark shipped</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.orders.length === 0 && <p className="muted center">No orders here.</p>}
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </div>
      )}
    </>
  );
}
