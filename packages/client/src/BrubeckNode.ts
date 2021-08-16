import { inject, Lifecycle, scoped } from 'tsyringe'
import { NetworkNodeOptions, createNetworkNode, NetworkNode } from 'streamr-network'
import { pOnce, uuid, instanceId, counterId } from './utils'
import { Context } from './utils/Context'
import { Config } from './Config'
import { StreamMessage } from 'streamr-client-protocol'
import { DestroySignal } from './DestroySignal'

const uid = process.pid != null ? `p${process.pid}` : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

@scoped(Lifecycle.ContainerScoped)
export default class BrubeckNode implements Context {
    private cachedNode?: NetworkNode
    options
    id
    debug

    constructor(
        context: Context,
        private destroySignal: DestroySignal,
        @inject(Config.Network) options: NetworkNodeOptions
    ) {
        this.options = options
        this.id = instanceId(this, uid)
        this.debug = context.debug.extend(this.id)
        destroySignal.onDestroy(this.destroy)
    }

    destroy = pOnce(async () => {
        this.debug('destroy >>')
        this.getNode.reset()

        // stop node only if started or in progress
        if (this.cachedNode) {
            const node = this.cachedNode
            this.cachedNode = undefined
            this.debug('stopping node >>')
            await node.stop()
            this.debug('stopping node <<')
        }

        this.debug('destroy <<')
    })

    async connect() {
        await this.getNode()
    }

    getNode = pOnce(async () => {
        this.debug('getNode >>')
        this.destroySignal.assertNotDestroyed(this)

        const node = createNetworkNode({
            disconnectionWaitTime: 200,
            ...this.options,
            id: `${uid}-${counterId(this.id)}`,
            name: this.id,
        })

        await node.start()

        if (this.destroySignal.isDestroyed()) {
            this.debug('stopping node before init >>')
            await node.stop()
            this.debug('stopping node before init <<')
        }

        // don't attach if disconnected while in progress
        this.destroySignal.assertNotDestroyed(this)

        this.cachedNode = node

        this.debug('getNode <<')
        return node
    })

    publishToNode(streamMessage: StreamMessage) {
        this.debug('publishToNode >> %o', streamMessage.getMessageID())
        try {
            this.destroySignal.assertNotDestroyed(this)
            if (!this.cachedNode) {
                return this.getNode().then((node) => {
                    return node.publish(streamMessage)
                })
            }

            return this.cachedNode.publish(streamMessage)
        } finally {
            this.debug('publishToNode << %o', streamMessage.getMessageID())
        }
    }
}
