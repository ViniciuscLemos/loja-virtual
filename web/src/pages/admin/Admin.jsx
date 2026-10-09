import { NavLink, Route, Routes } from 'react-router';
import AdminOrders from './AdminOrders';
import AdminProducts from './AdminProducts';
import AdminUsers from './AdminUsers';

export default function Admin() {
  return (
    <>
      <div className="row-between">
        <h1>Admin</h1>
        <nav className="tabs">
          <NavLink to="/admin" end>Products</NavLink>
          <NavLink to="/admin/orders">Orders</NavLink>
          <NavLink to="/admin/users">Users</NavLink>
        </nav>
      </div>
      <Routes>
        <Route index element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="users" element={<AdminUsers />} />
      </Routes>
    </>
  );
}
