/** Kullanıcıya gösterilecek biçimlendirme yardımcıları. */

/** Saniyeyi "1 sa 08 dk" biçimine çevirir; 1 saatin altı "12 dk". */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours > 0) {
    const paddedMinutes = String(minutes).padStart(2, '0');
    return `${hours} ${'sa'} ${paddedMinutes} ${'dk'}`;
  }
  return `${minutes} ${'dk'}`;
}

/** ISO-8601 tarih metnini yerel kısa biçime çevirir (örn. "Eki 2026"). */
export function formatMonthYear(isoDate: string, locale = 'tr-TR'): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoDate.slice(0, 7);
  }
}

/** İsim listesini "A. Yılmaz, B. Demir" biçiminde birleştirir. */
export function formatNames(names: readonly string[], max = 3): string {
  return names.slice(0, max).join(', ');
}

/** Kuruş cinsinden fiyatı "₺49,90" biçimine çevirir. */
export function formatKurus(kurus: number): string {
  if (!Number.isFinite(kurus) || kurus < 0) {
    return '₺0,00';
  }
  const lira = Math.floor(kurus / 100);
  const cents = String(kurus % 100).padStart(2, '0');
  return `₺${lira},${cents}`;
}
