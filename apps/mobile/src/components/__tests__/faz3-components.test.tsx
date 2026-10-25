/**
 * Faz 3 bileşen testleri — PriceCard, ContinueCard, SegmentedControl render.
 * RNTL v14: await render(...) + destructure query'ler (screen API kullanılmaz).
 */
import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { PriceCard } from '@/components/ui/price-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ContinueCard } from '@/components/home/continue-card';
import { ThemeProvider } from '@/theme/theme-provider';
import { I18nProvider } from '@/i18n';
import type { PlaybackEntry } from '@/store/playback-store';

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { LinearGradient: View };
});
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider locale="tr">{children}</I18nProvider>
    </ThemeProvider>
  );
}

const entry: PlaybackEntry = {
  contentId: 'c_kum_saati',
  contentTitle: 'Kum Saati Protokolü',
  episodeId: 'e_kum_101',
  episodeTitle: 'Saat 03:14',
  seasonNumber: 1,
  episodeNumber: 1,
  positionSeconds: 300,
  durationSeconds: 1240,
  verticalPreviewUrl: null,
  posterUrl: null,
  accessType: 'FREE',
  updatedAt: Date.now(),
};

describe('PriceCard', () => {
  it('başlık, fiyat ve madde işaretlerini gösterir', async () => {
    const { getByText } = await render(
      <Providers>
        <PriceCard
          title="Yıllık"
          priceText="₺399,90"
          subText="aylık ₺33,33"
          bullets={['Reklamsız izleme', 'Tüm üyelere özel yapımlar']}
          badges={[{ label: 'Yeni', tone: 'accent' }]}
        />
      </Providers>
    );
    expect(getByText('Yıllık')).toBeTruthy();
    expect(getByText('₺399,90')).toBeTruthy();
    expect(getByText('Reklamsız izleme')).toBeTruthy();
  });
});

describe('SegmentedControl', () => {
  it('üç segmenti çizer ve etiketleri gösterir', async () => {
    const { getByText } = await render(
      <Providers>
        <SegmentedControl
          options={[
            { value: 'favorites', label: 'Favoriler' },
            { value: 'continue', label: 'Devam' },
            { value: 'history', label: 'Geçmiş' },
          ]}
          value="continue"
          onChange={() => undefined}
        />
      </Providers>
    );
    expect(getByText('Devam')).toBeTruthy();
    expect(getByText('Favoriler')).toBeTruthy();
  });
});

describe('ContinueCard', () => {
  it('kalan süreyi gösterir', async () => {
    const { getByText } = await render(
      <Providers>
        <ContinueCard entry={entry} onPress={() => undefined} />
      </Providers>
    );
    // 1240 - 300 = 940 sn = 16 dk
    expect(getByText('16 dk kaldı')).toBeTruthy();
  });
});
