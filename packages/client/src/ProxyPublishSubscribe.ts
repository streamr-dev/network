import { StreamDefinition } from './types'
import { StreamIDBuilder } from './StreamIDBuilder'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { NetworkNodeFacade } from './NetworkNodeFacade'
import { ProxyDirection } from '@streamr/protocol'

@scoped(Lifecycle.ContainerScoped)
export class ProxyPublishSubscribe {

    private node: NetworkNodeFacade
    private streamIdBuilder: StreamIDBuilder

    constructor(
        node: NetworkNodeFacade,
        @inject(StreamIDBuilder) streamIdBuilder: StreamIDBuilder,
    ) {
        this.node = node
        this.streamIdBuilder = streamIdBuilder
    }

    async openProxyConnections(streamDefinition: StreamDefinition, nodeIds: string[], direction: ProxyDirection): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled(
            nodeIds.map((nodeId) => this.node.openProxyConnection(streamPartId, nodeId, direction))
        )
    }

    async closeProxyConnections(streamDefinition: StreamDefinition, nodeIds: string[], direction: ProxyDirection): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled(
            nodeIds.map(async (nodeId) => this.node.closeProxyConnection(streamPartId, nodeId, direction))
        )
    }
}
