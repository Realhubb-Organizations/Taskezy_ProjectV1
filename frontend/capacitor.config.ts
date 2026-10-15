import type { CapacitorConfig } from '@capacitor/cli';

// Release builds load the live site. For a local test APK, sync with
// CAP_SERVER_URL pointing at the laptop's dev server, e.g.
//   CAP_SERVER_URL=http://192.168.1.20:3000/auth/login npx cap sync android
// (http only allowed for that case), then sync again without it before
// building anything for release.
const serverUrl = process.env.CAP_SERVER_URL || 'https://taskezy.in/auth/login';

const config: CapacitorConfig = {
  appId: 'com.realcrm.taskezy.app',
  appName: 'TASKEZY',
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    // Bundled page shown when taskezy.in can't load (no internet, dropped
    // connection), with a Retry button — instead of the app getting stuck.
    errorPath: 'app-offline.html'
  }
};

export default config;
