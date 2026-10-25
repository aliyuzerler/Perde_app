/**
 * Ayar satırı — profil/ayarlar ekranı için.
 * Ya değer metni (chevron ile) ya da Switch gösterir.
 */
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { AppText } from '@/components/ui/app-text';

export interface SettingRowProps {
  label: string;
  hint?: string;
  value?: string;
  switchValue?: boolean;
  onSwitchChange?: (next: boolean) => void;
  onPress?: () => void;
  /** Son satırda ayırıcı çizilmez. */
  last?: boolean;
}

export function SettingRow({
  label,
  hint,
  value,
  switchValue,
  onSwitchChange,
  onPress,
}: SettingRowProps) {
  const { theme } = useTheme();

  const content = (
    <>
      <View style={styles.texts}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color="textSubtle">
            {hint}
          </AppText>
        ) : null}
      </View>
      {typeof switchValue === 'boolean' && onSwitchChange ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ true: theme.colors.accent, false: theme.colors.surfaceElevated }}
          thumbColor={theme.colors.text}
        />
      ) : (
        <View style={styles.valueRow}>
          {value ? (
            <AppText variant="caption" color="textSubtle">
              {value}
            </AppText>
          ) : null}
          {onPress ? (
            <Ionicons
              name="chevron-forward-outline"
              size={16}
              color={theme.colors.textSubtle}
            />
          ) : null}
        </View>
      )}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.row}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
