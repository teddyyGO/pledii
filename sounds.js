const fs = require('fs');
const path = require('path');

const soundsDir = path.join(__dirname, 'sounds');
const SOUNDS = {};

for (const file of fs.readdirSync(soundsDir)) {
  const ext = path.extname(file).toLowerCase();
  if (ext !== '.ogg' && ext !== '.mp3') continue;

  const name = path.basename(file, ext);
  // Prefer .ogg over .mp3 if both exist
  if (!SOUNDS[name] || ext === '.ogg') {
    SOUNDS[name] = path.join(soundsDir, file);
  }
}

// Discord limits choices to 25
const SOUND_CHOICES = Object.keys(SOUNDS)
  .slice(0, 25)
  .map(name => ({ name, value: name }));

if (SOUND_CHOICES.length === 0) {
  console.warn('[WARNING] No sound files found in /sounds — .ogg and .mp3 are supported');
}

module.exports = { SOUNDS, SOUND_CHOICES };
