import nodemailer from 'nodemailer';
import type { EmailProvider, SendEmailOptions } from './EmailProvider.js';

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: nodemailer.Transporter;
  private readonly config: { host: string; port: number; user: string; hasPass: boolean };

  constructor(
    private readonly from: string,
    options: {
      host: string;
      port: number;
      user: string;
      pass: string;
    }
  ) {
    this.config = { host: options.host, port: options.port, user: options.user, hasPass: !!options.pass };
    console.log('[email] SMTP config:', {
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      auth: options.user ? `${options.user} (password ${options.pass ? 'set' : 'NOT set'})` : 'none',
      from,
    });

    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      auth: options.user ? { user: options.user, pass: options.pass } : undefined,
      tls: { rejectUnauthorized: false },
    });

    // Verify connection on startup (non-blocking)
    this.transporter.verify((err, success) => {
      if (err) {
        console.error('[email] SMTP connection FAILED:', err.message);
      } else if (success) {
        console.log('[email] SMTP connection verified OK');
      }
    });
  }

  async send(options: SendEmailOptions): Promise<void> {
    console.log('[email] Sending to:', options.to, '| subject:', options.subject, '| via', this.config.host + ':' + this.config.port);
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      console.log('[email] Sent OK — messageId:', info.messageId, '| accepted:', info.accepted, '| rejected:', info.rejected);
    } catch (err) {
      console.error('[email] Send FAILED to', options.to, ':', err);
      throw err;
    }
  }
}
