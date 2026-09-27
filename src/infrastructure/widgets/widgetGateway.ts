import { Capacitor, registerPlugin } from '@capacitor/core'

import type { WidgetSnapshotWriter } from '@/domain/ports'
import type { ComingUpSnapshot } from '@/domain/widget'

interface WidgetPlugin {
  writeComingUp(options: { snapshot: string }): Promise<void>
}

const nativePlugin = registerPlugin<WidgetPlugin>('KindyWidget')

class NativeWidgetGateway implements WidgetSnapshotWriter {
  async writeComingUp(snapshot: ComingUpSnapshot): Promise<void> {
    await nativePlugin.writeComingUp({ snapshot: JSON.stringify(snapshot) })
  }
}

/** Browsers have no home screen; Settings shows a preview instead. */
class NoWidgetGateway implements WidgetSnapshotWriter {
  async writeComingUp(): Promise<void> {}
}

let gateway: WidgetSnapshotWriter | undefined

export function getWidgetGateway(): WidgetSnapshotWriter {
  gateway ??= Capacitor.isNativePlatform() ? new NativeWidgetGateway() : new NoWidgetGateway()
  return gateway
}
