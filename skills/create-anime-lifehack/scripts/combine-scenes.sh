#!/bin/bash
set -e

# Usage: combine-scenes.sh <scene1.mp4> <scene2.mp4> <scene3.mp4> <scene4.mp4> <output.mp4> [fade_duration]
# Combines 4 scene videos with fadeblack transitions and audio crossfade.
# Normalizes all scenes to 1080x1920 (9:16 vertical).

if [ $# -lt 5 ]; then
  echo "Usage: $0 <scene1> <scene2> <scene3> <scene4> <output> [fade_duration=0.5]"
  exit 1
fi

S1="$1"
S2="$2"
S3="$3"
S4="$4"
OUT="$5"
FADE="${6:-0.5}"

# Verify input files exist
for f in "$S1" "$S2" "$S3" "$S4"; do
  if [ ! -f "$f" ]; then
    echo "Error: File not found: $f"
    exit 1
  fi
done

# Get actual durations using ffprobe
D1=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$S1")
D2=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$S2")
D3=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$S3")
D4=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$S4")

echo "Scene durations: D1=${D1}s D2=${D2}s D3=${D3}s D4=${D4}s"
echo "Fade duration: ${FADE}s"

# Calculate xfade offsets dynamically
# O1 = D1 - FADE
# O2 = D1 + D2 - 2*FADE
# O3 = D1 + D2 + D3 - 3*FADE
O1=$(echo "$D1 - $FADE" | bc)
O2=$(echo "$D1 + $D2 - 2 * $FADE" | bc)
O3=$(echo "$D1 + $D2 + $D3 - 3 * $FADE" | bc)

echo "Offsets: O1=${O1} O2=${O2} O3=${O3}"

# Create output directory if needed
mkdir -p "$(dirname "$OUT")"

echo "=== Combining scenes with fadeblack transitions ==="

ffmpeg -y \
  -i "$S1" \
  -i "$S2" \
  -i "$S3" \
  -i "$S4" \
  -filter_complex "\
[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[sv0];\
[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[sv1];\
[2:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[sv2];\
[3:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[sv3];\
[sv0][sv1]xfade=transition=fadeblack:duration=$FADE:offset=$O1[v01];\
[v01][sv2]xfade=transition=fadeblack:duration=$FADE:offset=$O2[v02];\
[v02][sv3]xfade=transition=fadeblack:duration=$FADE:offset=$O3[vout];\
[0:a][1:a]acrossfade=d=$FADE[a01];\
[a01][2:a]acrossfade=d=$FADE[a02];\
[a02][3:a]acrossfade=d=$FADE[aout]" \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -pix_fmt yuv420p -crf 20 -preset medium \
  -c:a aac -b:a 192k \
  "$OUT"

FINAL_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT")
FINAL_SIZE=$(ls -lh "$OUT" | awk '{print $5}')

echo ""
echo "============================================================"
echo "COMBINED VIDEO"
echo "============================================================"
echo "File: $OUT"
echo "Duration: ${FINAL_DURATION}s"
echo "Size: $FINAL_SIZE"
echo "============================================================"
