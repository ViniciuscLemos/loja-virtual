import type { Email } from './mailer.js';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// one simple layout for every email, with inline styles because email clients ignore <style>
function layout(title: string, paragraphs: string[], button?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');
  const action = button
    ? `<p style="margin:22px 0"><a href="${escape(button.url)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escape(button.label)}</a></p>
       <p style="margin:0;color:#6b7280;font-size:13px">If the button doesn't work, copy this link: ${escape(button.url)}</p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827">
  <h2 style="margin:0 0 18px">${escape(title)}</h2>${body}${action}
  <p style="margin:28px 0 0;color:#9ca3af;font-size:12px">Online Store</p>
</div>`;
}

export function verifyEmail(name: string, to: string, url: string): Email {
  return {
    to,
    subject: 'Confirm your email',
    text: `Hi ${name}!\n\nConfirm your email to be able to place orders:\n${url}\n\nThe link is valid for 24 hours.`,
    html: layout(
      'Confirm your email',
      [`Hi ${escape(name)}!`, 'Confirm your email to be able to place orders. The link is valid for 24 hours.'],
      { label: 'Confirm email', url },
    ),
  };
}

export function resetPassword(name: string, to: string, url: string): Email {
  return {
    to,
    subject: 'Reset your password',
    text: `Hi ${name}!\n\nSomeone asked to reset the password of this account. If it was you, use this link (valid for 1 hour):\n${url}\n\nIf it wasn't you, just ignore this email.`,
    html: layout(
      'Reset your password',
      [
        `Hi ${escape(name)}!`,
        'Someone asked to reset the password of this account. If it was you, use the button below. The link is valid for 1 hour.',
        "If it wasn't you, just ignore this email, nothing changes.",
      ],
      { label: 'Choose a new password', url },
    ),
  };
}

export function passwordChanged(name: string, to: string): Email {
  return {
    to,
    subject: 'Your password was changed',
    text: `Hi ${name}!\n\nThe password of your account was just changed and every session was logged out. If it wasn't you, reset it again right away.`,
    html: layout('Your password was changed', [
      `Hi ${escape(name)}!`,
      "The password of your account was just changed and every session was logged out. If it wasn't you, reset it again right away.",
    ]),
  };
}
