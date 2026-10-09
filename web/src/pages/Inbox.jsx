import { useEffect, useState } from 'react';
import { api } from '../api';
import { date } from '../format';
import { useStore } from '../store';

// Without SMTP the server keeps the emails in memory; this page shows the ones sent to you.
export default function Inbox() {
  const { user } = useStore();
  const [emails, setEmails] = useState(null);
  const [open, setOpen] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/inbox')
      .then((r) => setEmails(r.emails))
      .catch((e) => setError(e.status === 404 ? 'This server sends real emails, check your email app.' : e.message));
  }, []);

  if (error) return <p className="error-box">{error}</p>;
  if (!emails) return <p className="muted center">Loading...</p>;

  const current = emails[open];

  return (
    <>
      <h1>Inbox</h1>
      <p className="muted">
        Demo mode: the store doesn't send real emails, so the ones sent to <b>{user.email}</b> show up here.
      </p>
      {emails.length === 0 ? (
        <p className="muted">No emails yet. They disappear when the server restarts.</p>
      ) : (
        <div className="inbox">
          <ul>
            {emails.map((e, i) => (
              <li key={i}>
                <button className={i === open ? 'mail active' : 'mail'} onClick={() => setOpen(i)}>
                  <strong>{e.subject}</strong>
                  <span className="muted small">{date(e.sentAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {/* sandbox: the email html can't run scripts; links open in a new tab */}
          <iframe
            title={current.subject}
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            srcDoc={`<base target="_top">${current.html}`}
          />
        </div>
      )}
    </>
  );
}
