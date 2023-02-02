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

    async setProxies(
        streamDefinition: StreamDefinition,
        nodeIds: string[],
        direction: ProxyDirection,
        connectionCount?: number
    ): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.setProxies(streamPartId, nodeIds, direction, connectionCount)
    }

}
