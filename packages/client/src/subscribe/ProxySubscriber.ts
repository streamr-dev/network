import { StreamDefinition } from '../types'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { inject, Lifecycle, scoped } from 'tsyringe'
import BrubeckNode from '../BrubeckNode'
import { Context } from '../utils/Context'
import { ProxyDirection } from 'streamr-client-protocol'

@scoped(Lifecycle.ContainerScoped)
export default class ProxySubscriber {
    constructor(
        context: Context,
        private node: BrubeckNode,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
    ) {}

    async setSubscribeProxies(streamDefinition: StreamDefinition, nodeIds: string[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled(
            nodeIds.map((nodeId) => this.node.openProxyConnection(streamPartId, nodeId, ProxyDirection.SUBSCRIBE))
        )
    }

    async removeSubscribeProxies(streamDefinition: StreamDefinition, nodeIds: string[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled(
            nodeIds.map(async (nodeId) => this.node.closeProxyConnection(streamPartId, nodeId, ProxyDirection.SUBSCRIBE))
        )
    }
}
