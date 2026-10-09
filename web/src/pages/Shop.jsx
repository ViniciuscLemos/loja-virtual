import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { Pagination, ProductCard } from '../components/common';

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(params.get('search') ?? '');

  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const page = Number(params.get('page') ?? 1);

  useEffect(() => {
    api.get('/products/categories').then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    const query = new URLSearchParams({ sort, page, limit: 12 });
    if (category) query.set('category', category);
    if (params.get('search')) query.set('search', params.get('search'));
    api
      .get(`/products?${query}`)
      .then((r) => {
        setData(r);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [params, category, sort, page]);

  // changing a filter goes back to page 1
  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  return (
    <>
      <section className="hero">
        <h1>Things for people who build things</h1>
        <p className="muted">Mugs, apparel and desk gear. Every order is real code: Stripe, emails and stock that can run out.</p>
      </section>

      <div className="filters">
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ search: search.trim() });
          }}
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" aria-label="Search" />
          <button type="submit">Search</button>
        </form>
        <select value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="name">Name</option>
        </select>
      </div>

      <div className="chips">
        <button className={!category ? 'chip active' : 'chip'} onClick={() => update({ category: '' })}>All</button>
        {categories.map((c) => (
          <button key={c} className={category === c ? 'chip active' : 'chip'} onClick={() => update({ category: c })}>
            {c}
          </button>
        ))}
      </div>

      {error && <p className="error-box">{error}</p>}
      {!data && !error && <p className="muted center">Loading...</p>}
      {data && data.products.length === 0 && <p className="muted center">No products found.</p>}

      {data && (
        <>
          <div className="grid">
            {data.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => update({ page: String(p) })} />
        </>
      )}
    </>
  );
}
