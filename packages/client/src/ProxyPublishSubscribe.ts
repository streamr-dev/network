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

    async addProxyConnectionCandidates(
        streamDefinition: StreamDefinition,
        nodeIds: string[],
        direction: ProxyDirection,
        targetNumberOfProxies?: number
    ): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.addProxyConnectionCandidates(streamPartId, nodeIds, direction, targetNumberOfProxies)
    }

    async removeProxyConnectionCandidates(
        streamDefinition: StreamDefinition,
        nodeIds: string[],
        direction: ProxyDirection
    ): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.removeProxyConnectionCandidates(streamPartId, nodeIds, direction)
    }

    async removeAllProxyConnectionCandidates(streamDefinition: StreamDefinition, direction: ProxyDirection): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.removeAllProxyConnectionCandidates(streamPartId, direction)
    }

    async setProxyConnectionTargetCount(streamDefinition: StreamDefinition, targetCount: number): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.setProxyConnectionTargetCount(streamPartId, targetCount)
    }
}
