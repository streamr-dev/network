import { Logger, TheGraphClient } from '@streamr/utils'
import { shuffle } from 'lodash'
import { Lifecycle, scoped } from 'tsyringe'
import { NetworkPeerDescriptor } from '../Config'
import { LoggerFactory } from '../utils/LoggerFactory'
import { StreamID } from '../exports'

// TODO maybe this class could be removed/renamed (the method could be extracted to be a function as there is no state)

interface OperatorMetadata {
    id: string
    latestHeartbeatMetadata: string
}

interface Query {
    query: string
}

@scoped(Lifecycle.ContainerScoped)
export class OperatorRegistry {
    private readonly theGraphClient: TheGraphClient
    private readonly logger: Logger

    constructor(
        theGraphClient: TheGraphClient,
        loggerFactory: LoggerFactory
    ) {
        this.theGraphClient = theGraphClient
        this.logger = loggerFactory.createLogger(module)
    }

    async findRandomNetworkEntrypoints(
        maxEntryPoints: number,
        maxQueryResults: number, 
        maxHeartbeatAgeHours: number,
    ): Promise<NetworkPeerDescriptor[]> {
        const createQuery = (): Query => {
            return {
                query: `{
                    operators(
                        orderBy: latestHeartbeatTimestamp
                        orderDirection: desc
                        first: ${maxQueryResults}
                        where: {
                            latestHeartbeatMetadata_contains: "\\"tls\\":true", 
                            latestHeartbeatTimestamp_gt: "${Math.floor(Date.now() / 1000) - (maxHeartbeatAgeHours * 60 * 60)}"
                        }
                    ) {
                        id
                        latestHeartbeatMetadata
                    }
                }`
            }
        }
        const peerDescriptors = await this.queryPeerDescriptors(createQuery)
        const picked = shuffle(peerDescriptors).slice(0, maxEntryPoints)
        this.logger.debug(`Found ${peerDescriptors.length} network entrypoints, picked ${picked.length}`, { picked })
        return picked
    }

    async findOperatorsOnStream(streamId: StreamID, maxQueryResults: number): Promise<NetworkPeerDescriptor[]> {
        const createQuery = (): Query => {
            return {
                query: `{
                    stream(id: ${streamId}) {
                        sponsorships(where: {isRunning: true}) {
                            stakes(first: ${maxQueryResults}, orderBy: updateTimestamp, orderDirection: desc) {
                                operator {
                                    latestHeartbeatMetadata
                                    latestHeartbeatTimestamp
                                }
                            }
                        }
                    }
                }`
            }
        }
        const peerDescriptors = await this.queryPeerDescriptors(createQuery)
        return peerDescriptors
    }

    private async queryPeerDescriptors(createQuery: () => Query): Promise<NetworkPeerDescriptor[]> {
        const operatorMetadatas = this.theGraphClient.queryEntities<OperatorMetadata>(createQuery)
        const peerDescriptors: NetworkPeerDescriptor[] = []
        for await (const operator of operatorMetadatas) {
            peerDescriptors.push(JSON.parse(operator.latestHeartbeatMetadata))
        }
        return peerDescriptors
    }

}
