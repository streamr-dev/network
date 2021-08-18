/**
 * Client-wide destroy signal.
 */
import { scoped, Lifecycle } from 'tsyringe'

import { Context, ContextError } from './utils/Context'
import Signal from './utils/Signal'

/**
 * Listen to onDestroy to fire cleanup code on destroy.
 * Careful not to introduce memleaks.
 * Trigger this to destroy the client.
 */
@scoped(Lifecycle.ContainerScoped)
export class DestroySignal {
    onDestroy = Signal.once<void, this>(this)

    destroy() {
        return this.onDestroy.trigger()
    }

    assertNotDestroyed(context: Context, msg = 'Client is destroyed. Create a new instance') {
        if (this.isDestroyed()) {
            throw new ContextError(context, msg)
        }
    }

    isDestroyed() {
        return this.onDestroy.triggerCount() > 0
    }
}
