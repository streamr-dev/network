import { inject, Lifecycle, scoped } from 'tsyringe'
import { NetworkNodeOptions, startNetworkNode, NetworkNode } from 'streamr-network'
import { pOnce, uuid, instanceId, counterId } from '../utils'
import { Context } from '../utils/Context'
import { Config } from './Config'
import { StreamMessage } from 'streamr-client-protocol'

const uid = process.pid != null ? `p${process.pid}` : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

@scoped(Lifecycle.ContainerScoped)
export default class BrubeckNode implements Context {
    private cachedNode?: NetworkNode
    options
    id
    debug
    enabled = false
    private callCount = 0

    constructor(context: Context, @inject(Config.Network) options: NetworkNodeOptions) {
        this.options = options
        this.id = instanceId(this, uid)
        this.debug = context.debug.extend(this.id)
    }

    connect = pOnce(async () => {
        this.debug('connect >>', this.getNode.isStarted())
        await this.getNode()
        this.debug('connect <<', this.getNode.isStarted())
    })

    disconnect = pOnce(async () => {
        this.debug('disconnect >>')
        this.connect.reset()
        this.enabled = false

        // stop node only if started or in progress
        if (this.getNode.isStarted()) {
            let stopTask
            if (this.cachedNode) {
                stopTask = this.cachedNode.stop()
                this.cachedNode = undefined
            }
            const nodeTask = this.getNode()
            this.getNode.reset() // immediately allow getting new node again
            const node = await nodeTask
            await node.stop()
            await stopTask
        }
        this.debug('disconnect <<')
    })

    getNode = pOnce(() => {
        this.callCount += 1
        const { callCount } = this
        this.debug('getNode >>', callCount)
        this.enabled = true
        this.disconnect.reset()
        const node = await startNetworkNode({
            disconnectionWaitTime: 200,
            ...this.options,
            id: `${uid}-${counterId(this.id)}`,
            name: this.id,
        })

        if (this.enabled && this.callCount === callCount) {
            // don't attach if disconnected while in progress
            this.cachedNode = node
        }

        this.debug('getNode <<', callCount)
        return node
    })

    publishToNode(streamMessage: StreamMessage) {
        this.debug('publishToNode >> %o', streamMessage.getMessageID())
        try {
            if (this.enabled && this.cachedNode) {
                return this.cachedNode.publish(streamMessage)
            }

            return this.getNode().then((node) => {
                if (!this.enabled) { return streamMessage }

                return node.publish(streamMessage)
            })
        } finally {
            this.debug('publishToNode << %o', streamMessage.getMessageID())
        }
    }
}
