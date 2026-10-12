import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.realcrm.taskezy.app',
  appName: 'TASKEZY',
  webDir: 'out',
  server: {
    url: 'https://taskezy.in/auth/login',
    cleartext: false,
    // Bundled page shown when taskezy.in can't load (no internet, dropped
    // connection), with a Retry button — instead of the app getting stuck.
    errorPath: 'app-offline.html'
  }
};

export default config;
