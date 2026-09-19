import { Capacitor, registerPlugin } from '@capacitor/core'

import type { SecurityGateway } from '@/domain/ports'

interface KindySecurityPlugin {
  availability(): Promise<{ available: boolean; status: number }>
  isAppLockEnabled(): Promise<{ enabled: boolean }>
  setAppLockEnabled(options: { enabled: boolean }): Promise<void>
  authenticate(): Promise<{ authenticated: boolean; errorCode?: number }>
  getDatabasePassphrase(): Promise<{ passphrase: string }>
}

const nativePlugin = registerPlugin<KindySecurityPlugin>('KindySecurity')
const WEB_LOCK_KEY = 'kindy.preview.app-lock'

class NativeSecurityGateway implements SecurityGateway {
  async availability(): Promise<boolean> {
    return (await nativePlugin.availability()).available
  }

  async isAppLockEnabled(): Promise<boolean> {
    return (await nativePlugin.isAppLockEnabled()).enabled
  }

  async setAppLockEnabled(enabled: boolean): Promise<void> {
    await nativePlugin.setAppLockEnabled({ enabled })
  }

  async authenticate(): Promise<boolean> {
    return (await nativePlugin.authenticate()).authenticated
  }

  async getDatabasePassphrase(): Promise<string> {
    return (await nativePlugin.getDatabasePassphrase()).passphrase
  }
}

class BrowserSecurityGateway implements SecurityGateway {
  async availability(): Promise<boolean> {
    return true
  }

  async isAppLockEnabled(): Promise<boolean> {
    return localStorage.getItem(WEB_LOCK_KEY) === 'true'
  }

  async setAppLockEnabled(enabled: boolean): Promise<void> {
    localStorage.setItem(WEB_LOCK_KEY, String(enabled))
  }

  async authenticate(): Promise<boolean> {
    return true
  }

  async getDatabasePassphrase(): Promise<string> {
    throw new Error('Database encryption keys are only available in the native app')
  }
}

let gateway: SecurityGateway | undefined

export function getSecurityGateway(): SecurityGateway {
  gateway ??= Capacitor.isNativePlatform()
    ? new NativeSecurityGateway()
    : new BrowserSecurityGateway()
  return gateway
}
