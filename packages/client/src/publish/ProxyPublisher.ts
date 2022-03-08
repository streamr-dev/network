import { StreamDefinition } from '../types'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { inject, Lifecycle, scoped } from 'tsyringe'
import BrubeckNode from '../BrubeckNode'
import { Context } from '../utils/Context'
import { ProxyDirection } from 'streamr-client-protocol'

@scoped(Lifecycle.ContainerScoped)
export default class ProxyPublisher {
    constructor(
        context: Context,
        private node: BrubeckNode,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
    ) {
    }

    async setPublishProxies(streamDefinition: StreamDefinition, nodeIds: string[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled(
            nodeIds.map((nodeId) => this.node.openProxyConnection(streamPartId, nodeId, ProxyDirection.PUBLISH))
        )
    }

    async removePublishProxies(streamDefinition: StreamDefinition, nodeIds: string[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled(
            nodeIds.map(async (nodeId) => this.node.closeProxyConnection(streamPartId, nodeId, ProxyDirection.PUBLISH))
        )
    }
}
