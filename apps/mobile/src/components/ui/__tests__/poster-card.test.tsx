/**
 * PosterCard bileşen testi: dikdörtgen kart kuralları, erişilebilirlik
 * etiketleri ve placeholder davranışı.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { PosterCard } from '../poster-card';

jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: View };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { LinearGradient: View };
});

describe('PosterCard', () => {
  it('başlığı ve erişilebilirlik etiketini gösterir', async () => {
    const { getByText, getByLabelText } = await render(
      <PosterCard
        title="Gece Yarısı Konseri"
        metaText="2026 • gerilim"
        aspect="poster"
        imageUrl={null}
        accessType="FREE"
      />
    );
    expect(getByText('Gece Yarısı Konseri')).toBeTruthy();
    expect(getByLabelText('Gece Yarısı Konseri. 2026 • gerilim')).toBeTruthy();
  });

  it('ücretsiz içerikte erişim rozeti göstermez', async () => {
    const { queryByText } = await render(
      <PosterCard
        title="Son Vapur"
        aspect="poster"
        imageUrl={null}
        accessType="FREE"
      />
    );
    expect(queryByText('Üyelere özel')).toBeNull();
    expect(queryByText('Kredi ile')).toBeNull();
  });

  it('abonelik içeriğinde "Üyelere özel" rozeti gösterir', async () => {
    const { getByText } = await render(
      <PosterCard
        title="Kırık Sekiz"
        aspect="poster"
        imageUrl={null}
        accessType="SUBSCRIPTION"
      />
    );
    expect(getByText('Üyelere özel')).toBeTruthy();
  });

  it('yeni içerikte "Yeni" rozeti gösterir', async () => {
    const { getByText } = await render(
      <PosterCard
        title="Kum Saati Protokolü"
        aspect="poster"
        imageUrl={null}
        accessType="SUBSCRIPTION"
        isNew
      />
    );
    expect(getByText('Yeni')).toBeTruthy();
  });

  it("kaynak görsel yoksa başlık monogramı placeholder'da görünür", async () => {
    const { getByText } = await render(
      <PosterCard
        title="Kum Saati"
        aspect="poster"
        imageUrl={null}
        accessType="FREE"
      />
    );
    // Placeholder dekoratif öğedir (accessibilityElementsHidden) — RNTL bunu
    // varsayılan sorgudan gizler; render edildiğini doğrulamak için dahil ederiz.
    expect(getByText('KS', { includeHiddenElements: true })).toBeTruthy();
  });

  it('kaynak görsel varsa placeholder monogramı gösterilmez', async () => {
    const { queryByText } = await render(
      <PosterCard
        title="Kum Saati"
        aspect="poster"
        imageUrl="https://cdn.perdego.test/kum-saati.jpg"
        accessType="FREE"
      />
    );
    expect(queryByText('KS', { includeHiddenElements: true })).toBeNull();
  });
});
