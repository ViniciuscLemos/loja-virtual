import nodemailer from 'nodemailer';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SentEmail extends Email {
  sentAt: Date;
}

export interface Mailer {
  kind: 'smtp' | 'outbox';
  send(email: Email): Promise<void>;
  // only the outbox has this: the emails stay in memory instead of going out
  inbox?(address: string): SentEmail[];
}

export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    kind: 'smtp',
    async send(email) {
      await transport.sendMail({ from, ...email });
    },
  };
}

// Without SMTP the emails are kept in memory. That's what the tests use, and it also lets
// the store run as a demo: the front end has an inbox page that shows the emails
// sent to the logged in person, so you can click the confirmation link without a real email.
export function outboxMailer({ log = false, max = 200 } = {}): Mailer {
  const sent: SentEmail[] = [];
  return {
    kind: 'outbox',
    async send(email) {
      sent.unshift({ ...email, sentAt: new Date() });
      sent.length = Math.min(sent.length, max);
      if (log) console.log(`[email] to ${email.to}: ${email.subject}\n${email.text}\n`);
    },
    inbox: (address) => sent.filter((e) => e.to === address),
  };
}
