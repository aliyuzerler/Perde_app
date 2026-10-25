/**
 * Yasal metin ekranı — /legal/terms ve /legal/privacy derin bağlantıları.
 * Metin sunucudan (sürümlü LegalDocument) gelir; mock modda mock metin.
 */
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { queryKeys } from '@/hooks/queries/query-keys';
import { spacing } from '@/theme/tokens';

export default function LegalDocumentScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ doc?: string }>();
  const slug = params.doc === 'privacy' ? 'privacy' : 'terms';

  const doc = useQuery({
    queryKey: queryKeys.legal(slug),
    queryFn: () => contentApi.getLegalDocument(slug),
  });

  const title = slug === 'privacy' ? t('auth.legalPrivacy') : t('auth.legalTerms');

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={{ padding: spacing[4], paddingTop: spacing[5], gap: spacing[2] }}
      >
        <AppText variant="display">{title}</AppText>
        {doc.isLoading ? <LoadingView variant="detail" /> : null}
        {doc.isError ? (
          <ErrorView title={t('auth.errorGeneric')} onRetry={() => void doc.refetch()} />
        ) : null}
        {doc.data ? (
          <View>
            <AppText variant="caption" color="textSubtle">
              {`v${doc.data.version} · ${doc.data.updatedAt}`}
            </AppText>
            {doc.data.content.split('\n').map((line, index) => (
              <AppText
                key={index}
                variant={line.startsWith('#') ? 'heading' : 'body'}
                color="textMuted"
              >
                {line.replace(/^#+\s*/, '')}
              </AppText>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
