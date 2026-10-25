import { describe, expect, it } from 'vitest';
import { maskEmail } from './users.service';

describe('maskEmail', () => {
  it('yerel kısmı maskeler', () => {
    expect(maskEmail('ayse@ornek.com')).toBe('a***@ornek.com');
  });

  it('uzun yerel kısmını tamamen maskeler', () => {
    const masked = maskEmail('cokuzunisim@ornek.com');
    expect(masked).toBe('c' + '*'.repeat(10) + '@ornek.com');
  });

  it('@ yoksa olduğu gibi döner (bozulmuş veri koruması)', () => {
    expect(maskEmail('gecersiz')).toBe('gecersiz');
  });
});
