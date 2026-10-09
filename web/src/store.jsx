import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

// Who is logged in, the cart and the server mode (demo or real), shared by every page.
const StoreContext = createContext(null);

const EMPTY_CART = { items: [], subtotalCents: 0, count: 0 };

export function StoreProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  const [cart, setCart] = useState(EMPTY_CART);
  const [config, setConfig] = useState({ email: 'outbox', payments: 'demo' });
  const [toast, setToast] = useState(null);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      return user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      setCart(await api.get('/cart'));
    } catch {
      setCart(EMPTY_CART);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    api.get('/config').then(setConfig).catch(() => {});
  }, [refreshUser]);

  useEffect(() => {
    if (user) refreshCart();
    else setCart(EMPTY_CART);
  }, [user, refreshCart]);

  const notify = useCallback((message, type = 'ok') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function setQuantity(productId, quantity) {
    setCart(await api.put(`/cart/items/${productId}`, { quantity }));
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }

  const value = { user, setUser, refreshUser, cart, refreshCart, setQuantity, config, logout, toast, notify };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
