import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { money, stockLabel } from '../format';
import { useStore } from '../store';

export function ProductImage({ product, size }) {
  return product.imageUrl ? (
    <img className={`product-image ${size ?? ''}`} src={product.imageUrl} alt={product.name} loading="lazy" />
  ) : (
    <div className={`product-image placeholder ${size ?? ''}`}>{product.name[0]}</div>
  );
}

// the + on the card adds one unit without opening the product. Logged out, it goes to the login
function QuickAdd({ product }) {
  const { user, cart, setQuantity, notify } = useStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const inCart = cart.items.find((i) => i.product.id === product.id)?.quantity ?? 0;
  // everything left is already in the cart
  const full = inCart >= product.stock;

  async function add() {
    if (!user) return navigate(`/login?next=/products/${product.slug}`);
    setBusy(true);
    try {
      await setQuantity(product.id, inCart + 1);
      notify(`${product.name} added to the cart.`);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (product.stock === 0) return null;

  return (
    <button
      className="quick-add"
      onClick={add}
      disabled={busy || full}
      aria-label={full ? `All the ${product.name} left are in your cart` : `Add ${product.name} to the cart`}
      title={full ? 'All in your cart' : 'Add to cart'}
    >
      <Icon name={full ? 'check' : 'plus'} size={20} />
    </button>
  );
}

export function ProductCard({ product }) {
  return (
    <article className="product-card">
      <Link to={`/products/${product.slug}`} className="product-link">
        <ProductImage product={product} />
        <div className="product-info">
          <span className="muted small">{product.category}</span>
          <strong>{product.name}</strong>
          <div className="row-between">
            <span className="price">{money(product.priceCents)}</span>
            <span className={`stock ${product.stock === 0 ? 'out' : product.stock <= 5 ? 'low' : ''}`}>
              {stockLabel(product.stock)}
            </span>
          </div>
        </div>
      </Link>
      <QuickAdd product={product} />
    </article>
  );
}

// gray blocks with the shape of the content while it loads
export function Skeleton({ width = '100%', height = 16, radius = 8, style }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="product-card">
          <Skeleton height="auto" radius={0} style={{ aspectRatio: '1', display: 'block' }} />
          <div className="product-info">
            <Skeleton width="40%" height={12} />
            <Skeleton width="75%" height={18} />
            <Skeleton width="30%" height={16} />
          </div>
        </div>
      ))}
    </div>
  );
}

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20h.01M17 20h.01',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span className="muted">Page {page} of {totalPages}</span>
      <button className="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}

export function QuantityPicker({ value, max, onChange, disabled }) {
  return (
    <div className="quantity">
      <button type="button" className="secondary" aria-label="Less" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <span>{value}</span>
      <button type="button" className="secondary" aria-label="More" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

const STATUS = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  shipped: 'Shipped',
  canceled: 'Canceled',
};

export function StatusBadge({ status }) {
  return <span className={`status ${status}`}>{STATUS[status] ?? status}</span>;
}

export function Field({ label, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="error-text">{error}</small>}
    </label>
  );
}
