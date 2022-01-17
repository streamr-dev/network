/**
 * Wrap a network node.
 */
import { inject, Lifecycle, scoped } from 'tsyringe'
import { NetworkNodeOptions, createNetworkNode, NetworkNode, MetricsContext } from 'streamr-network'
import { pOnce, uuid, instanceId } from './utils'
import { Context } from './utils/Context'
import { Config } from './Config'
import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { DestroySignal } from './DestroySignal'
import Ethereum from './Ethereum'

/**
 * Wrap a network node.
 * Lazily creates & starts node on first call to getNode().
 */
@scoped(Lifecycle.ContainerScoped)
export default class BrubeckNode implements Context {
    private cachedNode?: NetworkNode
    options
    id
    debug
    private startNodeCalled = false
    private startNodeComplete = false

    constructor(
        context: Context,
        private destroySignal: DestroySignal,
        private ethereum: Ethereum,
        @inject(Config.Network) options: NetworkNodeOptions
    ) {
        this.options = options
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        destroySignal.onDestroy(this.destroy)
    }

    private assertNotDestroyed() {
        this.destroySignal.assertNotDestroyed(this)
    }

    async initNode() {
        this.assertNotDestroyed()
        if (this.cachedNode) { return this.cachedNode }

        const { options } = this
        let { id } = options

        // generate id if none supplied
        if (id == null || id === '') {
            id = await this.generateId()
        }

        this.debug('initNode', id)
        const node = createNetworkNode({
            disconnectionWaitTime: 200,
            name: id,
            ...options,
            id,
            metricsContext: new MetricsContext(options.name ?? id)
        })

        if (!this.destroySignal.isDestroyed()) {
            this.cachedNode = node
        }

        return node
    }

    private async generateId() {
        if (this.ethereum.isAuthenticated()) {
            const address = await this.ethereum.getAddress()
            return `${address}#${uuid()}`
            // eslint-disable-next-line no-else-return
        } else {
            return Ethereum.generateEthereumAccount().address
        }
    }

    /**
     * Stop network node, or wait for it to stop if already stopping.
     * Subsequent calls to getNode/start will fail.
     */
    destroy = pOnce(async () => {
        this.debug('destroy >>')

        const node = this.cachedNode
        this.cachedNode = undefined
        // stop node only if started or in progress
        if (node && this.startNodeCalled) {
            this.debug('stopping node >>')
            if (!this.startNodeComplete) {
                // wait for start to finish before stopping node
                const startNodeTask = this.startNode()
                this.startNode.reset() // allow subsequent calls to fail
                await startNodeTask
            }

            await node.stop()
            this.debug('stopping node <<')
        }
        this.startNode.reset() // allow subsequent calls to fail

        this.debug('destroy <<')
    })

    /**
     * Start network node, or wait for it to start if already started.
     */
    startNode = pOnce(async () => {
        this.startNodeCalled = true
        this.debug('start >>')
        try {
            const node = await this.initNode()
            if (!this.destroySignal.isDestroyed()) {
                await node.start()
            }

            if (this.destroySignal.isDestroyed()) {
                this.debug('stopping node before init >>')
                await node.stop()
                this.debug('stopping node before init <<')
            }
            this.assertNotDestroyed()
            return node
        } finally {
            this.startNodeComplete = true
            this.debug('start <<')
        }
    })

    /**
     * Get started network node.
     */
    getNode = this.startNode

    async getNodeId() {
        const node = await this.getNode()
        return node.getNodeId()
    }

    /**
     * Calls publish on node after starting it.
     * Basically a wrapper around: (await getNode()).publish(…)
     * but will be sync in case that node is already started.
     * Zalgo intentional. See below.
     */
    publishToNode(streamMessage: StreamMessage): void | Promise<void> {
        // NOTE: function is intentionally not async for performance reasons.
        // Will call cachedNode.publish immediately if cachedNode is set.
        // Otherwise will wait for node to start.
        this.debug('publishToNode >> %o', streamMessage.getMessageID())
        try {
            this.destroySignal.assertNotDestroyed(this)

            if (!this.cachedNode || !this.startNodeComplete) {
                // use .then instead of async/await so
                // this.cachedNode.publish call can be sync
                return this.startNode().then((node) => {
                    return node.publish(streamMessage)
                })
            }

            return this.cachedNode.publish(streamMessage)
        } finally {
            this.debug('publishToNode << %o', streamMessage.getMessageID())
        }
    }

    openPublishProxyConnectionOnStreamPartition(streamPartId: StreamPartID, nodeId: string): void | Promise<void> {
        try {
            if (!this.cachedNode || !this.startNodeComplete) {
                return this.startNode().then((node) => {
                    return node.joinStreamAsPurePublisher(streamPartId, nodeId)
                })
            }
            return this.cachedNode.joinStreamAsPurePublisher(streamPartId, nodeId)
        } finally {
            this.debug('openProxyConnectionOnStream << %o', streamPartId, nodeId)
        }
    }

    closePublishProxyConnectionOnStreamPartition(streamPartId: StreamPartID, nodeId: string): void {
        try {
            if (!this.cachedNode || !this.startNodeComplete) {
                return
            }
            this.cachedNode.leavePurePublishingStream(streamPartId, nodeId)
        } finally {
            this.debug('closeProxyConnectionOnStream << %o', streamPartId, nodeId)
        }
    }
}
