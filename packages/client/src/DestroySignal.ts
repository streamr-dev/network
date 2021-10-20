/**
 * Client-wide destroy signal.
 */
import { scoped, Lifecycle } from 'tsyringe'
import { instanceId } from './utils'

import { Context, ContextError } from './utils/Context'
import Signal from './utils/Signal'

/**
 * Listen to onDestroy to fire cleanup code on destroy.
 * Careful not to introduce memleaks.
 * Trigger this to destroy the client.
 */
@scoped(Lifecycle.ContainerScoped)
export class DestroySignal implements Context {
    onDestroy = Signal.once()
    trigger = this.destroy
    id = instanceId(this)
    debug
    constructor(context: Context) {
        this.debug = context.debug.extend(this.id)
        this.onDestroy(() => {
            this.debug('triggered')
        })
    }

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
