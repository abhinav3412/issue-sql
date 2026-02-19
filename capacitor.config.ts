import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.agf.petrol',
  appName: 'AGF Petrol',
  webDir: 'www',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
      }
    : undefined,
  android: {
    allowMixedContent: true,
  },
};

export default config;
