/**
 * Client-wide destroy signal.
 */
import { Lifecycle, scoped } from 'tsyringe'
import { StreamrClientError } from './StreamrClientError'
import { Signal } from './utils/Signal'

/**
 * Listen to onDestroy to fire cleanup code on destroy.
 * Careful not to introduce memleaks.
 * Trigger this to destroy the client.
 */
@scoped(Lifecycle.ContainerScoped)
export class DestroySignal {
    public readonly onDestroy = Signal.once()
    public readonly trigger = this.destroy
    public readonly abortSignal: AbortSignal

    constructor() {
        const controller = new AbortController()
        this.abortSignal = controller.signal
        this.onDestroy.listen(() => {
            controller.abort()
        })
    }

    destroy(): Promise<void> {
        return this.onDestroy.trigger()
    }

    assertNotDestroyed(): void {
        if (this.isDestroyed()) {
            throw new StreamrClientError('Client is destroyed. Create a new instance', 'CLIENT_DESTROYED')
        }
    }

    isDestroyed(): boolean {
        return this.onDestroy.triggerCount() > 0
    }
}
