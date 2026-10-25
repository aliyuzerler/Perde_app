/** Bilinmeyen rotalar için 404 ekranı. */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { ScreenContainer } from '@/components/screen-container';
import { EmptyView } from '@/components/state-views/empty-view';

export default function NotFoundScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <EmptyView
          title={t('notFound.title')}
          body={t('notFound.body')}
          icon="navigate-outline"
          ctaLabel={t('notFound.backHome')}
          onCtaPress={() => router.replace('/(tabs)')}
        />
      </View>
    </ScreenContainer>
  );
}

const getStyles = (_colors: unknown) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
    },
  });
