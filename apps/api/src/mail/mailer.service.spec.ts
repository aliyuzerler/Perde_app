/**
 * MailerService birim testleri — SMTP yapılandırılmadığında geliştirme
 * transport'u JSONL outbox'a yazar; şablonlar doğru bağlantıyı üretir.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MailerService } from './mailer.service';
import type { Env } from '../config/env.schema';

const tmp = mkdtempSync(join(tmpdir(), 'perdego-mail-'));
const outboxFile = join(tmp, 'outbox.jsonl');

const mailer = new MailerService({
  SMTP_HOST: undefined,
  SMTP_PORT: 1025,
  SMTP_FROM: 'PerdeGo <no-reply@perdego.local>',
  MAIL_OUTBOX_FILE: outboxFile,
} as unknown as Env);

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('MailerService (geliştirme transport)', () => {
  beforeEach(() => {
    if (existsSync(outboxFile)) rmSync(outboxFile);
  });

  it('send JSONL outbox satırı yazar (to/subject/text/html/sentAt/transport)', async () => {
    const record = await mailer.send({
      to: 'ayse@ornek.com',
      subject: 'Selam',
      text: 'gövde',
      html: '<p>gövde</p>',
    });
    expect(record.transport).toBe('dev-file');

    const lines = readFileSync(outboxFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as { to: string; subject: string; sentAt: string };
    expect(parsed.to).toBe('ayse@ornek.com');
    expect(parsed.sentAt).toBeTruthy();
  });

  it('doğrulama e-postası anahtar bağlantısını ve Türkçe gövdeyi taşır', async () => {
    const mail = mailer.verificationEmail('ayse@ornek.com', 'Ayşe', 'https://app/auth/verify-email?token=abc123def456');
    expect(mail.subject).toContain('doğrulama');
    expect(mail.text).toContain('token=abc123def456');
    expect(mail.text).toContain('24 saat');
    expect(mail.html).toContain('Ayşe');
  });

  it('sıfırlama e-postası TTL dakikasını ve bağlantıyı içerir', () => {
    const mail = mailer.passwordResetEmail('a@b.c', 'Ali', 'https://app/auth/reset-password?token=xyz', 30);
    expect(mail.subject).toContain('sıfırlama');
    expect(mail.text).toContain('30 dakika');
    expect(mail.text).toContain('token=xyz');
  });

  it('silme e-postası tarih ve geri alma yolu gösterir', () => {
    const purgeAt = new Date('2026-11-25T10:00:00Z').toISOString();
    const mail = mailer.deletionScheduledEmail('a@b.c', 'Ali', purgeAt);
    expect(mail.subject).toContain('silme talebi');
    expect(mail.text).toContain('geri');
  });
});
