import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.thucphamsomot.order',
  appName: 'TPS1 Đặt hàng',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: { SplashScreen: { launchShowDuration: 1200, backgroundColor: '#ffffff' } },
};

export default config;
