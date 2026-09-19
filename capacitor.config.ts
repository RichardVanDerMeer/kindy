import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'nl.richardvandermeer.kindy',
  appName: 'Kindy',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Unlock Kindy',
        biometricSubTitle: 'Use your screen lock to continue',
      },
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_kindy',
      iconColor: '#7c4dff',
    },
  },
}

export default config
