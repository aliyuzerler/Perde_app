/**
 * Video sahnesi (FAZ 4) — expo-video VideoView sarmalayıcı.
 *
 * Oynatıcı motoru YALNIZCA bu bileşende bilinir (sağlayıcı izolasyonu):
 * ekran/kontroller motor-agnostik prop'larla çalışır. Görüntü kırpılmasına
 * karşı contentFit='contain' ZORUNLUDUR — 9:16 içerik farklı ekran
 * oranlarında zarf (letterbox) ile gösterilir (görev: kırpma testi).
 *
 * Tam ekran: JS state ile sahne tüm ekranı kaplar (chrome gizlenir) ve
 * dikey içerikte yön kilidi PORTRAIT'e alınır. Yatay (16:9) içerik ileride
 * LANDSCAPE kilidine geçer (oranla karar).
 */
import { memo, useEffect } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { VideoView, type VideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';

/** RN 0.88 tip kümesinde absoluteFillObject yok — eşdeğeri yerel sabit. */
const absoluteFill = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

export interface VideoStageProps {
  player: VideoPlayer | null;
  /** Tam ekran modu açık mı (ekran tarafındaki state). */
  fullscreen: boolean;
  style?: ViewStyle;
}

export const VideoStage = memo(function VideoStage({ player, fullscreen, style }: VideoStageProps) {
  // Tam ekran yön kilidi: dikey içerik → portrait kilit; çıkışta serbest.
  // Web'de yönelim API'si yok — sessiz atlanır (davranış farkı belgeli).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (fullscreen) {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined,
      );
    } else {
      void ScreenOrientation.unlockAsync().catch(() => undefined);
    }
  }, [fullscreen]);

  if (!player) {
    // Oynatıcı henüz kurulmadı: siyah sahne (yer tutucu, kırpma riski yok).
    return <View style={[styles.stage, style]} />;
  }

  return (
    <View style={[styles.stage, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    ...absoluteFill,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
});
