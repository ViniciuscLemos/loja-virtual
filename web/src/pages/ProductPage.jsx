import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api';
import { ProductImage, QuantityPicker } from '../components/common';
import { money, stockLabel } from '../format';
import { useStore } from '../store';
import NotFound from './NotFound';

export default function ProductPage() {
  const { slug } = useParams();
  const { user, cart, setQuantity, notify } = useStore();
  const navigate = useNavigate();
  const [product, setProduct] = useState(undefined);
  const [quantity, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProduct(undefined);
    api
      .get(`/products/${slug}`)
      .then((r) => setProduct(r.product))
      .catch(() => setProduct(null));
  }, [slug]);

  if (product === undefined) return <p className="muted center">Loading...</p>;
  if (product === null) return <NotFound />;

  const inCart = cart.items.find((i) => i.product.id === product.id)?.quantity ?? 0;
  const canAdd = Math.max(0, product.stock - inCart);

  async function add() {
    if (!user) return navigate(`/login?next=/products/${slug}`);
    setBusy(true);
    try {
      await setQuantity(product.id, inCart + quantity);
      notify(`${product.name} added to the cart.`);
      setQty(1);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="product-page">
      <ProductImage product={product} size="large" />
      <div>
        <Link to={`/?category=${encodeURIComponent(product.category)}`} className="muted small">{product.category}</Link>
        <h1>{product.name}</h1>
        <p className="price big">{money(product.priceCents)}</p>
        <p>{product.description}</p>
        <p className={`stock ${product.stock === 0 ? 'out' : product.stock <= 5 ? 'low' : ''}`}>{stockLabel(product.stock)}</p>

        {product.stock > 0 && (
          <div className="buy">
            <QuantityPicker value={quantity} max={Math.max(1, canAdd)} onChange={setQty} disabled={canAdd === 0} />
            <button onClick={add} disabled={busy || canAdd === 0}>
              {canAdd === 0 ? 'All in your cart' : 'Add to cart'}
            </button>
          </div>
        )}
        {inCart > 0 && (
          <p className="muted small">
            You have {inCart} in your <Link to="/cart">cart</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
