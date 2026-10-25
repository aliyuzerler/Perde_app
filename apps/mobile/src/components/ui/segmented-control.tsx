/**
 * Segmentli seçim denetimi — Planım (Favoriler / Devam / Geçmiş) ve benzeri.
 * Dikdörtgen segmentler (radius.sm); oval/rounded pill yok.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText } from '@/components/ui/app-text';
import { radius, spacing } from '@/theme/tokens';

export interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && { backgroundColor: theme.colors.accent }]}
          >
            <AppText variant="label" color={active ? 'text' : 'textMuted'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
});
