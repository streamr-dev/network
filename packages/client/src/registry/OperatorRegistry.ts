import { Lifecycle, scoped } from 'tsyringe'
import { TheGraphClient, Logger } from '@streamr/utils'
import { shuffle } from 'lodash'
import { NetworkPeerDescriptor } from '../Config'
import { LoggerFactory } from '../utils/LoggerFactory'

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
        interface OperatorMetadata {
            id: string
            latestHeartbeatMetadata: string
        }
        const createQuery = () => {
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
        const operatorMetadatas = this.theGraphClient.queryEntities<OperatorMetadata>(createQuery)
        const peerDescriptors: NetworkPeerDescriptor[] = []
        for await (const operator of operatorMetadatas) {
            peerDescriptors.push(JSON.parse(operator.latestHeartbeatMetadata))
        }
        const picked = shuffle(peerDescriptors).slice(0, maxEntryPoints)
        this.logger.debug(`Found ${peerDescriptors.length} network entrypoints, picked ${picked.length}`, { picked })
        return picked
    }
}
