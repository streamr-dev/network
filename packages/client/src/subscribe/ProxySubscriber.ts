import { StreamDefinition } from '../types'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { inject, Lifecycle, scoped } from 'tsyringe'
import BrubeckNode from '../BrubeckNode'
import { Context } from '../utils/Context'

@scoped(Lifecycle.ContainerScoped)
export default class ProxySubscriber {
    constructor(
        context: Context,
        private node: BrubeckNode,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
    ) {}
    async setSubscribeProxy(streamDefinition: StreamDefinition, nodeId: string): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.openSubscribeProxyConnectionOnStreamPart(streamPartId, nodeId)
    }

    async removeSubscribeProxy(streamDefinition: StreamDefinition, nodeId: string): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.closeSubscribeProxyConnectionOnStreamPart(streamPartId, nodeId)
    }

    async setSubscribeProxies(streamDefinition: StreamDefinition, nodeIds: string[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled([
            ...nodeIds.map((nodeId) => this.node.openSubscribeProxyConnectionOnStreamPart(streamPartId, nodeId))
        ])
    }

    async removeSubscribeProxies(streamDefinition: StreamDefinition, nodeIds: string[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled([
            ...nodeIds.map(async (nodeId) => this.node.closeSubscribeProxyConnectionOnStreamPart(streamPartId, nodeId))
        ])
    }
}
