import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { ProductImage, QuantityPicker } from '../components/common';
import { money } from '../format';
import { useStore } from '../store';

export default function Cart() {
  const { user, cart, setQuantity, refreshCart, notify } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function change(productId, quantity) {
    try {
      await setQuantity(productId, quantity);
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function checkout() {
    setBusy(true);
    setError('');
    try {
      const { checkoutUrl } = await api.post('/orders');
      // Stripe's page (or the demo checkout); after paying it comes back to the order page
      window.location.href = checkoutUrl;
    } catch (e) {
      setError(e.message);
      refreshCart();
      setBusy(false);
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="empty-state">
        <h1>Your cart is empty</h1>
        <p className="muted">Take a look at the <Link to="/">shop</Link>.</p>
      </div>
    );
  }

  const blocked = cart.items.some((i) => !i.available);

  return (
    <div className="cart-page">
      <section>
        <h1>Cart</h1>
        <ul className="cart-list">
          {cart.items.map(({ product, quantity, available }) => (
            <li key={product.id}>
              <Link to={`/products/${product.slug}`}><ProductImage product={product} size="thumb" /></Link>
              <div className="grow">
                <Link to={`/products/${product.slug}`}><strong>{product.name}</strong></Link>
                <p className="muted small">{money(product.priceCents)} each</p>
                {!available && <p className="error-text small">Only {product.stock} left. Lower the quantity.</p>}
              </div>
              <QuantityPicker value={quantity} max={Math.max(quantity, product.stock)} onChange={(q) => change(product.id, q)} />
              <strong className="line-total">{money(product.priceCents * quantity)}</strong>
              <button className="link danger" onClick={() => change(product.id, 0)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="card summary">
        <h2>Summary</h2>
        <div className="row-between"><span>Items</span><span>{cart.count}</span></div>
        <div className="row-between total"><span>Total</span><strong>{money(cart.subtotalCents)}</strong></div>
        {error && <p className="error-box small">{error}</p>}
        {!user.emailVerified && (
          <p className="muted small">Confirm your email before checking out. The link is in your <Link to="/inbox">inbox</Link>.</p>
        )}
        <button className="full" onClick={checkout} disabled={busy || blocked || !user.emailVerified}>
          {busy ? 'Opening the payment...' : 'Checkout'}
        </button>
        <p className="muted small">The items are reserved for 35 minutes while you pay.</p>
      </aside>
    </div>
  );
}
