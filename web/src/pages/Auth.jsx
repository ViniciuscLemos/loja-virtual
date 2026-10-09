import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, fieldErrors } from '../api';
import { Field } from '../components/common';
import { useStore } from '../store';

// only lets "next" point inside the store, so a link can't send someone to another site after login
function safeNext(params) {
  const next = params.get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const bind = (name) => ({ value: values[name], onChange: (e) => setValues({ ...values, [name]: e.target.value }) });

  async function submit(e, action) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      await action(values);
    } catch (error) {
      setErrors(fieldErrors(error));
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  return { values, bind, errors, message, busy, submit };
}

export function Login() {
  const { setUser } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm({ email: '', password: '' });

  return (
    <div className="auth card">
      <h1>Log in</h1>
      <form
        onSubmit={(e) =>
          form.submit(e, async (values) => {
            const { user } = await api.post('/auth/login', values);
            setUser(user);
            navigate(safeNext(params));
          })
        }
      >
        <Field label="Email" error={form.errors.email}>
          <input type="email" autoComplete="email" required {...form.bind('email')} />
        </Field>
        <Field label="Password" error={form.errors.password}>
          <input type="password" autoComplete="current-password" required {...form.bind('password')} />
        </Field>
        {form.message && !Object.keys(form.errors).length && <p className="error-box small">{form.message}</p>}
        <button className="full" disabled={form.busy}>Log in</button>
      </form>
      <p className="muted small">
        <Link to="/forgot-password">Forgot your password?</Link>
      </p>
      <p className="muted small">
        New here? <Link to={`/register?next=${encodeURIComponent(safeNext(params))}`}>Create an account</Link>
      </p>
    </div>
  );
}

export function Register() {
  const { setUser } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm({ name: '', email: '', password: '' });

  return (
    <div className="auth card">
      <h1>Create an account</h1>
      <form
        onSubmit={(e) =>
          form.submit(e, async (values) => {
            const { user } = await api.post('/auth/register', values);
            setUser(user);
            navigate(safeNext(params));
          })
        }
      >
        <Field label="Name" error={form.errors.name}>
          <input autoComplete="name" required {...form.bind('name')} />
        </Field>
        <Field label="Email" error={form.errors.email}>
          <input type="email" autoComplete="email" required {...form.bind('email')} />
        </Field>
        <Field label="Password" error={form.errors.password}>
          <input type="password" autoComplete="new-password" minLength={8} required {...form.bind('password')} />
        </Field>
        <p className="muted small">At least 8 characters. We'll send an email to confirm the address.</p>
        {form.message && !Object.keys(form.errors).length && <p className="error-box small">{form.message}</p>}
        <button className="full" disabled={form.busy}>Create account</button>
      </form>
      <p className="muted small">
        Already have an account? <Link to={`/login?next=${encodeURIComponent(safeNext(params))}`}>Log in</Link>
      </p>
    </div>
  );
}

export function ForgotPassword() {
  const { config } = useStore();
  const [sent, setSent] = useState(false);
  const form = useForm({ email: '' });

  if (sent) {
    return (
      <div className="auth card">
        <h1>Check your email</h1>
        <p>If there's an account with <b>{form.values.email}</b>, we sent a link to choose a new password. It's valid for 1 hour.</p>
        {config.email === 'outbox' && (
          <p className="muted small">Demo mode: log in and open the Inbox page, or check the server log, to see the email.</p>
        )}
      </div>
    );
  }

  return (
    <div className="auth card">
      <h1>Forgot your password?</h1>
      <p className="muted">Type your email and we'll send you a link to choose a new one.</p>
      <form
        onSubmit={(e) =>
          form.submit(e, async (values) => {
            await api.post('/auth/forgot-password', values);
            setSent(true);
          })
        }
      >
        <Field label="Email" error={form.errors.email}>
          <input type="email" autoComplete="email" required {...form.bind('email')} />
        </Field>
        {form.message && !Object.keys(form.errors).length && <p className="error-box small">{form.message}</p>}
        <button className="full" disabled={form.busy}>Send link</button>
      </form>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser, notify } = useStore();
  const form = useForm({ password: '' });
  const token = params.get('token') ?? '';

  return (
    <div className="auth card">
      <h1>Choose a new password</h1>
      <form
        onSubmit={(e) =>
          form.submit(e, async (values) => {
            await api.post('/auth/reset-password', { token, password: values.password });
            // the reset logs out every session, including this one
            setUser(null);
            notify('Password changed. Log in with the new one.');
            navigate('/login');
          })
        }
      >
        <Field label="New password" error={form.errors.password}>
          <input type="password" autoComplete="new-password" minLength={8} required {...form.bind('password')} />
        </Field>
        {form.message && !Object.keys(form.errors).length && <p className="error-box small">{form.message}</p>}
        <button className="full" disabled={form.busy || !token}>Save password</button>
      </form>
    </div>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { refreshUser } = useStore();
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const sent = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev, and the token only works once
    if (sent.current) return;
    sent.current = true;
    api
      .post('/auth/verify-email', { token: params.get('token') ?? '' })
      .then(() => {
        setState('ok');
        refreshUser();
      })
      .catch((e) => {
        setState('error');
        setError(e.message);
      });
  }, [params, refreshUser]);

  return (
    <div className="auth card center">
      {state === 'loading' && <p className="muted">Confirming...</p>}
      {state === 'ok' && (
        <>
          <h1>Email confirmed</h1>
          <p>All set, now you can place orders.</p>
          <Link to="/" className="button">Go shopping</Link>
        </>
      )}
      {state === 'error' && (
        <>
          <h1>Couldn't confirm</h1>
          <p className="error-box">{error}</p>
        </>
      )}
    </div>
  );
}
