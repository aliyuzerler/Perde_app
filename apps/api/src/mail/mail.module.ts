/**
 * E-posta modülü — MailerService'i sağlar (SMTP_HOST'a göre Mailpit uyumlu
 * SMTP ya da geliştirme dosya transport'u).
 */
import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/** Global: tüm iş modülleri tek örneği paylaşır (test override'ı tek noktadan). */
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailModule {}
