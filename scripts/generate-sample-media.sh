#!/usr/bin/env bash
# PerdeGo — Geliştirme örnek medya üreticisi (FAZ 4).
#
# Telifsiz, sentetik (lavfi ile üretilen) dikey 9:16 örnek videolar üretir.
# Çıktı: apps/api/media-storage/samples/{a,b,c}/
#   master.m3u8            → 3 kalite seviyeli HLS master (altyazı grubu dahil)
#   {240p,480p,720p}/      → varyant playlist + .ts segmentler
#   video.mp4              → web/ilerleyici (progressive) yedek akış
#   subtitles/{tr,en}.vtt  → demo altyazılar
#
# Kullanım:  bash scripts/generate-sample-media.sh
# Not: çıktı dizini .gitignore'dadır (ikili dosyalar depoya ait değildir);
# API oynatma uçları bu dosyalar olmadan MEDIA_MISSING hatası verir.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/api/media-storage/samples"
FONT_DIR="${FONT_DIR:-/usr/share/fonts/truetype/dejavu}"
FONT="$FONT_DIR/DejaVuSans.ttf"
if [[ ! -f "$FONT" ]]; then
  FONT="$(command -v fc-match >/dev/null && fc-match -f '%{file}' 'DejaVu Sans' || true)"
fi

require() { command -v "$1" >/dev/null 2>&1 || { echo "HATA: $1 bulunamadı"; exit 1; }; }
require ffmpeg
require ffprobe

echo "[sample-media] çıktı: $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

# Paket tanımları: ad | süre(sn) | lavfi kaynağı | renk/tema
# Performans notu: gradients süzgeci ucuzdur; fps 12 + ultrafast, geliştirme
# örnek akışları için yeterlidir ( bitrate merdiveni yine 3 seviyeli ).
BUNDLES=(
  "a|12|gradients=s=540x960:d=12:speed=0.04:c0=0x8E1B3A:c1=0x12070B:c2=0xB71C36:c3=0x2A0B12:n=2|Kayıp Sinyal"
  "b|12|gradients=s=540x960:d=12:speed=0.06:c0=0x143D2B:c1=0x070B09:c2=0x2E7D4F:c3=0x0E1A13:n=2|Son Vardiya"
  "c|12|gradients=s=540x960:d=12:speed=0.05:c0=0x3E1B47:c1=0x0B0B12:c2=0x7C3A5F:c3=0x141420:n=3|Gizli Bahçe"
)

# Kalite merdiveni: ad|çözünürlük|video bitrate|ses bitrate
VARIANTS=("240p|270x480|220k|48k" "360p|360x640|400k|64k" "540p|540x960|800k|96k")

write_vtt() {
  local dir="$1" title="$2"
  cat > "$dir/subtitles/tr.vtt" <<VTT
WEBVTT
NOTE Türkçe demo altyazı — sentetik örnek akış

1
00:00:00.500 --> 00:00:06.000
[$title] — dikey örnek sahne

2
00:00:06.000 --> 00:00:12.000
Bu altyazı geliştirme amaçlı üretilmiştir

3
00:00:12.000 --> 00:00:18.000
Oynatıcıdan altyazı seçimini test edin

4
00:00:18.000 --> 00:00:30.000
PerdeGo — dikey anlatı platformu
VTT
  cat > "$dir/subtitles/en.vtt" <<VTT
WEBVTT
NOTE English demo subtitle — synthetic sample stream

1
00:00:00.500 --> 00:00:06.000
[$title] — vertical sample scene

2
00:00:06.000 --> 00:00:12.000
This subtitle is generated for development

3
00:00:12.000 --> 00:00:18.000
Test subtitle selection in the player

4
00:00:18.000 --> 00:00:30.000
PerdeGo — vertical storytelling platform
VTT
}

for spec in "${BUNDLES[@]}"; do
  IFS='|' read -r name dur src title <<<"$spec"
  DIR="$OUT/$name"
  mkdir -p "$DIR/subtitles" "$DIR/tmp"
  echo "[sample-media] paket $name → $DIR ($title)"

  for vspec in "${VARIANTS[@]}"; do
    IFS='|' read -r v res vb ab <<<"$vspec"
    mkdir -p "$DIR/$v"
    # 1) Varyant MP4: H.264 + AAC (sessiz değil — düşük seviye sentetik ton,
    #    sesi aç/kapat davranışı gerçekçi test edilebilsin).
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i "$src" \
      -f lavfi -i "sine=frequency=440:sample_rate=48000" \
      -t "$dur" \
      -filter_complex "[0:v]scale=$res:flags=fast_bilinear,format=yuv420p[v];[1:a]volume=0.12[a]" \
      -map "[v]" -map "[a]" \
      -c:v libx264 -preset ultrafast -tune zerolatency \
      -b:v "$vb" -maxrate "$vb" -bufsize "$(echo "$vb" | tr -d 'k')k" \
      -g 48 -keyint_min 48 -sc_threshold 0 -r 12 \
      -c:a aac -b:a "$ab" -ac 2 \
      -movflags +faststart \
      "$DIR/tmp/$v.mp4"
    # 2) HLS paketleme (4 sn segment, VOD playlist)
    ffmpeg -hide_banner -loglevel error -y \
      -i "$DIR/tmp/$v.mp4" -c copy \
      -f hls -hls_time 4 -hls_playlist_type vod \
      -hls_segment_filename "$DIR/$v/seg%03d.ts" \
      "$DIR/$v/playlist.m3u8"
  done

  # 3) Web/progressive yedek akış (540p tek dosya)
  cp "$DIR/tmp/540p.mp4" "$DIR/video.mp4"

  # 4) Altyazılar
  write_vtt "$DIR" "$title"

  # 5) Master playlist — altyazı grubu + 3 seviye
  B240=$(ffprobe -v quiet -show_entries format=bit_rate -of csv=p=0 "$DIR/tmp/240p.mp4")
  B360=$(ffprobe -v quiet -show_entries format=bit_rate -of csv=p=0 "$DIR/tmp/360p.mp4")
  B540=$(ffprobe -v quiet -show_entries format=bit_rate -of csv=p=0 "$DIR/tmp/540p.mp4")
  cat > "$DIR/master.m3u8" <<M3U
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Türkçe",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="tr",URI="subtitles/tr.vtt"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="en",URI="subtitles/en.vtt"
#EXT-X-STREAM-INF:BANDWIDTH=$B240,RESOLUTION=270x480,CODECS="avc1.4d401f,mp4a.40.2",SUBTITLES="subs"
240p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=$B360,RESOLUTION=360x640,CODECS="avc1.4d401f,mp4a.40.2",SUBTITLES="subs"
360p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=$B540,RESOLUTION=540x960,CODECS="avc1.4d401f,mp4a.40.2",SUBTITLES="subs"
540p/playlist.m3u8
M3U

  rm -rf "$DIR/tmp"
done

echo "[sample-media] tamam. Üretilen paketler:"
du -sh "$OUT"/*/ | sed 's/^/  /'
