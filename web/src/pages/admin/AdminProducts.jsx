import { useCallback, useEffect, useState } from 'react';
import { api, fieldErrors } from '../../api';
import { Field, Pagination, ProductImage } from '../../components/common';
import { money, toCents } from '../../format';
import { useStore } from '../../store';

const EMPTY = { name: '', category: '', price: '', stock: '0', description: '', imageUrl: '', slug: '' };

function ProductForm({ product, onSaved, onClose }) {
  const { notify } = useStore();
  const [values, setValues] = useState(
    product
      ? {
          ...product,
          price: (product.priceCents / 100).toFixed(2),
          stock: String(product.stock),
          imageUrl: product.imageUrl ?? '',
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const bind = (name) => ({ value: values[name], onChange: (e) => setValues({ ...values, [name]: e.target.value }) });

  async function save(e) {
    e.preventDefault();
    const priceCents = toCents(values.price);
    if (!priceCents) return setErrors({ priceCents: 'Type a price like 12.90' });
    const body = {
      name: values.name,
      category: values.category,
      priceCents,
      stock: Number(values.stock),
      description: values.description,
      imageUrl: values.imageUrl.trim() || null,
      ...(values.slug ? { slug: values.slug } : {}),
    };
    setBusy(true);
    try {
      const { product: saved } = product
        ? await api.patch(`/admin/products/${product.id}`, body)
        : await api.post('/admin/products', body);
      notify(product ? 'Product saved.' : 'Product created.');
      onSaved(saved);
    } catch (error) {
      setErrors(fieldErrors(error));
      if (!error.fields) notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card product-form" onSubmit={save}>
      <div className="row-between">
        <h2>{product ? `Edit ${product.name}` : 'New product'}</h2>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>
      <div className="form-grid">
        <Field label="Name" error={errors.name}><input required {...bind('name')} /></Field>
        <Field label="Category" error={errors.category}><input required {...bind('category')} /></Field>
        <Field label="Price ($)" error={errors.priceCents}><input inputMode="decimal" required {...bind('price')} /></Field>
        <Field label="Stock" error={errors.stock}><input type="number" min="0" required {...bind('stock')} /></Field>
        <Field label="Image (url or /products/name.svg)" error={errors.imageUrl}><input {...bind('imageUrl')} /></Field>
        <Field label="Url (empty = made from the name)" error={errors.slug}><input placeholder="blue-mug" {...bind('slug')} /></Field>
      </div>
      <Field label="Description" error={errors.description}><textarea rows="3" {...bind('description')} /></Field>
      <button disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
    </form>
  );
}

export default function AdminProducts() {
  const { notify } = useStore();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // null, 'new' or a product

  const load = useCallback(() => {
    const query = new URLSearchParams({ status, page, limit: 20 });
    if (search.trim()) query.set('search', search.trim());
    api.get(`/admin/products?${query}`).then(setData).catch((e) => notify(e.message, 'error'));
  }, [status, page, search, notify]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(product) {
    try {
      if (product.active) await api.delete(`/admin/products/${product.id}`);
      else await api.patch(`/admin/products/${product.id}`, { active: true });
      notify(product.active ? `${product.name} archived.` : `${product.name} is back in the store.`);
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  return (
    <>
      <div className="filters">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search" aria-label="Search" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="all">All</option>
          <option value="active">In the store</option>
          <option value="low_stock">Low stock</option>
          <option value="archived">Archived</option>
        </select>
        <button onClick={() => setEditing('new')}>New product</button>
      </div>

      {editing && (
        <ProductForm
          key={editing === 'new' ? 'new' : editing.id}
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {!data ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'archived'}>
                  <td><ProductImage product={p} size="tiny" /></td>
                  <td><strong>{p.name}</strong><br /><span className="muted small">/{p.slug}</span></td>
                  <td>{p.category}</td>
                  <td>{money(p.priceCents)}</td>
                  <td className={p.stock === 0 ? 'error-text' : p.stock <= 5 ? 'warn-text' : ''}>{p.stock}</td>
                  <td>{p.active ? 'In the store' : 'Archived'}</td>
                  <td className="row-actions">
                    <button className="link" onClick={() => setEditing(p)}>Edit</button>
                    <button className="link" onClick={() => toggle(p)}>{p.active ? 'Archive' : 'Restore'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.products.length === 0 && <p className="muted center">Nothing here.</p>}
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </div>
      )}
    </>
  );
}
