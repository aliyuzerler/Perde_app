/**
 * E-posta servisi (Faz 3b).
 *
 * Transport seçimi (Teknik Kural 7):
 *  - SMTP_HOST tanımlı  → gerçek SMTP (yerel geliştirmede Mailpit: 1025).
 *  - SMTP_HOST boş      → geliştirme transport'u: e-postalar MAIL_OUTBOX_FILE
 *    JSONL dosyasına yazılır + konsola özet loglanır. Böylece Mailpit
 *    kurulumu olmayan ortamlarda da akış uçtan uca denenebilir.
 *
 * Testler MailerService'i sahte outbox ile override eder (integration spec).
 * Ham hata asla istemciye sızmaz; gönderim hataları loglanır, akış bozulmaz
 * (kullanıcı deneyimi: "e-posta gönderildi" — yeniden gönderme uçları var).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SentEmailRecord extends OutgoingEmail {
  sentAt: string;
  transport: 'smtp' | 'dev-file';
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: {
    sendMail: (mail: OutgoingEmail & { from: string }) => Promise<unknown>;
  } | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.SMTP_HOST) {
      // Lazy import: nodemailer yalnızca SMTP yapılandırıldığında yüklenir.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = require('nodemailer') as typeof import('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: false,
        // Mailpit yerel sertifika imzalamaz — geliştirme kabulu.
        tls: { rejectUnauthorized: false },
      });
      this.logger.log(`SMTP transport hazır: ${env.SMTP_HOST}:${env.SMTP_PORT} (Mailpit uyumlu)`);
    } else {
      this.transporter = null;
      this.logger.log(
        `SMTP_HOST tanımsız — geliştirme transport'u: e-postalar ${env.MAIL_OUTBOX_FILE} dosyasına yazılıyor`,
      );
    }
  }

  async send(email: OutgoingEmail): Promise<SentEmailRecord> {
    const record: SentEmailRecord = {
      ...email,
      sentAt: new Date().toISOString(),
      transport: this.transporter ? 'smtp' : 'dev-file',
    };

    if (this.transporter) {
      await this.transporter.sendMail({ from: this.env.SMTP_FROM, ...email });
    } else {
      this.writeDevOutbox(record);
      // FAZ 10 (bulgu F10-04): alıcı e-postası PII'dır — logda maskelenir
      // (kullanıcı@etki alanı → ku***@etki alanı).
      this.logger.log(`→ ${this.maskEmail(email.to)} | ${email.subject}`);
    }
    return record;
  }

  /** Geliştirme transport'u: JSONL dosya (canlı probe bu dosyayı okur). */
  private writeDevOutbox(record: SentEmailRecord): void {
    try {
      const filePath = resolve(process.cwd(), this.env.MAIL_OUTBOX_FILE);
      mkdirSync(resolve(filePath, '..'), { recursive: true });
      appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (error) {
      this.logger.warn(
        `Dev outbox dosyasına yazılamadı: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** PII maskesi: yerel kısmın ilk 2 karakteri + *** (Faz 10). */
  private maskEmail(to: string): string {
    const at = to.indexOf('@');
    if (at <= 0) return '***';
    const local = to.slice(0, at);
    return `${local.slice(0, 2)}***${to.slice(at)}`;
  }

  // --- Şablonlar ---------------------------------------------------------------

  verificationEmail(to: string, displayName: string, verifyUrl: string): OutgoingEmail {
    return {
      to,
      subject: 'PerdeGo — E-posta doğrulama',
      text:
        `Merhaba ${displayName},\n\n` +
        `PerdeGo hesabını doğrulamak için bağlantıya dokun:\n${verifyUrl}\n\n` +
        `Bağlantı 24 saat geçerlidir. Bu işlemi sen yapmadıysan bu e-postayı yok sayabilirsin.\n\n— PerdeGo`,
      html:
        `<p>Merhaba <strong>${escapeHtml(displayName)}</strong>,</p>` +
        `<p>PerdeGo hesabını doğrulamak için <a href="${verifyUrl}">buraya dokun</a>.</p>` +
        `<p style="color:#888">Bağlantı 24 saat geçerlidir. Bu işlemi sen yapmadıysan bu e-postayı yok sayabilirsin.</p>` +
        `<p>— PerdeGo</p>`,
    };
  }

  passwordResetEmail(to: string, displayName: string, resetUrl: string, ttlMinutes: number): OutgoingEmail {
    return {
      to,
      subject: 'PerdeGo — Parola sıfırlama',
      text:
        `Merhaba ${displayName},\n\n` +
        `Parolanı sıfırlamak için bağlantıya dokun:\n${resetUrl}\n\n` +
        `Bağlantı ${ttlMinutes} dakika geçerlidir. Bu işlemi sen yapmadıysan parolan değişmedi; ` +
        `bu e-postayı yok sayabilirsin.\n\n— PerdeGo`,
      html:
        `<p>Merhaba <strong>${escapeHtml(displayName)}</strong>,</p>` +
        `<p>Parolanı sıfırlamak için <a href="${resetUrl}">buraya dokun</a>.</p>` +
        `<p style="color:#888">Bağlantı ${ttlMinutes} dakika geçerlidir. Bu işlemi sen yapmadıysan parolan değişmedi.</p>` +
        `<p>— PerdeGo</p>`,
    };
  }

  deletionScheduledEmail(to: string, displayName: string, purgeAtIso: string): OutgoingEmail {
    const purgeDate = new Date(purgeAtIso).toLocaleDateString('tr-TR', {
      dateStyle: 'long',
    });
    return {
      to,
      subject: 'PerdeGo — Hesap silme talebin alındı',
      text:
        `Merhaba ${displayName},\n\n` +
        `Hesap silme talebin alındı. Kişisel verilerin ${purgeDate} tarihinde kalıcı olarak ` +
        `silinecek/anonimleştirilecek. Bu tarihten önce hesabına giriş yapıp "Hesabımı geri al" ` +
        `adımını tamamlayarak talebi iptal edebilirsin.\n\n— PerdeGo`,
      html:
        `<p>Merhaba <strong>${escapeHtml(displayName)}</strong>,</p>` +
        `<p>Hesap silme talebin alındı. Kişisel verilerin <strong>${purgeDate}</strong> tarihinde kalıcı olarak silinecek/anonimleştirilecek.</p>` +
        `<p>Bu tarihten önce giriş yapıp <strong>Hesabımı geri al</strong> adımını tamamlayarak talebi iptal edebilirsin.</p>` +
        `<p>— PerdeGo</p>`,
    };
  }

  deletionCanceledEmail(to: string, displayName: string): OutgoingEmail {
    return {
      to,
      subject: 'PerdeGo — Hesap silme talebi iptal edildi',
      text:
        `Merhaba ${displayName},\n\n` +
        `Hesap silme talebin iptal edildi ve hesabın yeniden etkinleştirildi. Keyifli izlemeler!\n\n— PerdeGo`,
      html:
        `<p>Merhaba <strong>${escapeHtml(displayName)}</strong>,</p>` +
        `<p>Hesap silme talebin iptal edildi ve hesabın yeniden etkinleştirildi. Keyifli izlemeler!</p>` +
        `<p>— PerdeGo</p>`,
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
