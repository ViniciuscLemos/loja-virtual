import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { date } from '../../format';
import { useStore } from '../../store';

export default function AdminUsers() {
  const { user: me, notify } = useStore();
  const [users, setUsers] = useState(null);

  const load = useCallback(() => {
    api.get('/admin/users').then((r) => setUsers(r.users)).catch((e) => notify(e.message, 'error'));
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(user) {
    const role = user.role === 'admin' ? 'customer' : 'admin';
    if (!confirm(`Make ${user.name} ${role === 'admin' ? 'an admin' : 'a customer'}?`)) return;
    try {
      await api.patch(`/admin/users/${user.id}/role`, { role });
      notify('Role changed. It applies on their next request.');
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  if (!users) return <p className="muted">Loading...</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong></td>
              <td>{u.email} {!u.emailVerified && <span className="muted small">(not confirmed)</span>}</td>
              <td>{u.role}</td>
              <td className="small">{date(u.createdAt)}</td>
              <td>
                {u.id !== me.id && (
                  <button className="link" onClick={() => changeRole(u)}>
                    {u.role === 'admin' ? 'Make customer' : 'Make admin'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
