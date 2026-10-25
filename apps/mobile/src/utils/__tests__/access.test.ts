/** Erişim görselleştirme kuralları testleri (sunucu kararı, istemci gösterimi). */
import { describe, expect, it } from '@jest/globals';
import { getAccessVisual } from '../access';

describe('getAccessVisual', () => {
  it('FREE içerik rozet ve kilit göstermez', () => {
    const visual = getAccessVisual('FREE');
    expect(visual.showBadge).toBe(false);
    expect(visual.locked).toBe(false);
  });

  it('SUBSCRIPTION içerik rozet ve kilit gösterir', () => {
    const visual = getAccessVisual('SUBSCRIPTION');
    expect(visual.showBadge).toBe(true);
    expect(visual.locked).toBe(true);
    expect(visual.labelKey).toBe('SUBSCRIPTION');
  });

  it('CREDIT içerik rozet ve kilit gösterir', () => {
    const visual = getAccessVisual('CREDIT');
    expect(visual.showBadge).toBe(true);
    expect(visual.locked).toBe(true);
  });
});
