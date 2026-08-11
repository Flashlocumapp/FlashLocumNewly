const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Config plugin that copies notification sound assets into native directories:
 *   iOS  → ios/<projectName>/new_request_chimes.wav  (bundle root, required for UNNotificationSound)
 *   Android → android/app/src/main/res/raw/new_request_chimes.wav  (required for NotificationChannel)
 */
function withNotificationSounds(config) {
  // iOS
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'assets', 'sounds', 'new_request_chimes.wav');
      const projectName = cfg.modRequest.projectName;
      const dest = path.join(cfg.modRequest.platformProjectRoot, projectName, 'new_request_chimes.wav');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('[withNotificationSounds] Copied new_request_chimes.wav → iOS bundle');
      } else {
        console.warn('[withNotificationSounds] Source not found, skipping iOS copy:', src);
      }
      return cfg;
    },
  ]);

  // Android
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'assets', 'sounds', 'new_request_chimes.wav');
      const rawDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'raw');
      const dest = path.join(rawDir, 'new_request_chimes.wav');
      if (fs.existsSync(src)) {
        fs.mkdirSync(rawDir, { recursive: true });
        fs.copyFileSync(src, dest);
        console.log('[withNotificationSounds] Copied new_request_chimes.wav → Android res/raw');
      } else {
        console.warn('[withNotificationSounds] Source not found, skipping Android copy:', src);
      }
      return cfg;
    },
  ]);

  return config;
}

module.exports = withNotificationSounds;
