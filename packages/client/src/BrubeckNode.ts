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
    isStarted = false

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

        const node = this.cachedNode
        this.cachedNode = undefined
        // stop node only if started or in progress
        if (node && this.isStarted) {
            this.debug('stopping node >>')
            await node.stop()
            this.debug('stopping node <<')
        }

        this.debug('destroy <<')
    })

    async connect() {
        await this.getNode()
    }

    initNode() {
        if (this.cachedNode) { return this.cachedNode }

        this.debug('initNode >>')

        this.destroySignal.assertNotDestroyed(this)

        const node = createNetworkNode({
            disconnectionWaitTime: 200,
            ...this.options,
            id: `${uid}-${counterId(this.id)}`,
            name: this.id,
        })

        this.cachedNode = node
        this.debug('initNode <<')

        return node
    }

    startNode = pOnce(async () => {
        this.isStarted = true
        this.debug('start >>')
        const node = this.initNode()
        await node.start()

        if (this.destroySignal.isDestroyed()) {
            this.debug('stopping node before init >>')
            await node.stop()
            this.debug('stopping node before init <<')
        }

        // don't attach if disconnected while in progress
        this.destroySignal.assertNotDestroyed(this)
        this.debug('start <<')
        return node
    })

    getNode = this.startNode

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
