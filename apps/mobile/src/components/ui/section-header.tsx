/** Ray (yatay liste) ve bölüm başlıkları. */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './app-text';
import { spacing } from '@/theme/tokens';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const SectionHeader = memo(function SectionHeader({
  title,
}: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <AppText variant="heading">{title}</AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
    marginTop: spacing[5],
    minHeight: 24,
    justifyContent: 'center',
  },
});
