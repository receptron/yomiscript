#!/bin/sh
# The macOS system voices (what the Web Speech API speaks with on a Mac) on every set: audio/system/<set>.<name>.wav.
# usage: sh audio_say.sh      (macOS; voices Kyoko for Japanese, Samantha for English)
cd "$(dirname "$0")" && mkdir -p audio/system
node -e 'import("./sets.mjs").then(m=>{for(const [s,v] of Object.entries(m.SETS))for(const x of v)console.log([s,x.name,x.lang,x.text.replace(/\n/g," ")].join("\t"))})' |
  while IFS="$(printf '\t')" read -r set name lang text; do
    case "$lang" in ja) v=Kyoko ;; *) v=Samantha ;; esac
    say -v "$v" -o "audio/system/$set.$name.aiff" -- "$text" &&
      ffmpeg -loglevel error -y -i "audio/system/$set.$name.aiff" -ar 24000 -ac 1 "audio/system/$set.$name.wav" &&
      rm "audio/system/$set.$name.aiff"
  done
