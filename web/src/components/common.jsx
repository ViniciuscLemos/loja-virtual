import { Link } from 'react-router';
import { money, stockLabel } from '../format';

export function ProductImage({ product, size }) {
  return product.imageUrl ? (
    <img className={`product-image ${size ?? ''}`} src={product.imageUrl} alt={product.name} loading="lazy" />
  ) : (
    <div className={`product-image placeholder ${size ?? ''}`}>{product.name[0]}</div>
  );
}

export function ProductCard({ product }) {
  return (
    <Link to={`/products/${product.slug}`} className="product-card">
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
