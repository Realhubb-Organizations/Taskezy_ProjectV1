import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.realcrm.taskezy.app',
  appName: 'TASKEZY',
  webDir: 'out',
  server: {
    url: 'https://taskezy.in/auth/login',
    cleartext: false
  }
};

export default config;
