/**
 * Client-wide destroy signal.
 */
import { scoped, Lifecycle } from 'tsyringe'
import { instanceId } from './utils'

import { Context, ContextError } from './utils/Context'
import { Signal } from './utils/Signal'

/**
 * Listen to onDestroy to fire cleanup code on destroy.
 * Careful not to introduce memleaks.
 * Trigger this to destroy the client.
 */
@scoped(Lifecycle.ContainerScoped)
export class DestroySignal implements Context {
    public onDestroy = Signal.once()
    public trigger = this.destroy
    readonly id = instanceId(this)
    readonly debug

    constructor(context: Context) {
        this.debug = context.debug.extend(this.id)
        this.onDestroy.listen(() => {
            this.debug('triggered')
        })
    }

    destroy(): Promise<void> {
        return this.onDestroy.trigger()
    }

    assertNotDestroyed(context: Context, msg = 'Client is destroyed. Create a new instance'): void {
        if (this.isDestroyed()) {
            throw new ContextError(context, msg)
        }
    }

    isDestroyed(): boolean {
        return this.onDestroy.triggerCount() > 0
    }
}
