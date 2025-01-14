import { Logger, TheGraphClient, GraphQLQuery } from '@streamr/utils'
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

interface StreamOperators {
    stream: {
        sponsorships: Sponsorship[]
    }
}

interface Sponsorship {
    stakes: {
        operator: OperatorMetadata
    }[]
}

@scoped(Lifecycle.ContainerScoped)
export class OperatorRegistry {
    private readonly theGraphClient: TheGraphClient
    private readonly logger: Logger

    constructor(theGraphClient: TheGraphClient, loggerFactory: LoggerFactory) {
        this.theGraphClient = theGraphClient
        this.logger = loggerFactory.createLogger(module)
    }

    async findRandomNetworkEntrypoints(
        maxEntryPoints: number,
        maxQueryResults: number,
        maxHeartbeatAgeHours: number
    ): Promise<NetworkPeerDescriptor[]> {
        const createQuery = (): GraphQLQuery => {
            return {
                query: `{
                    operators(
                        orderBy: latestHeartbeatTimestamp
                        orderDirection: desc
                        first: ${maxQueryResults}
                        where: {
                            latestHeartbeatMetadata_contains: "\\"tls\\":true", 
                            latestHeartbeatTimestamp_gt: "${Math.floor(Date.now() / 1000) - maxHeartbeatAgeHours * 60 * 60}"
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

    async findOperatorsOnStream(
        streamId: StreamID,
        maxQueryResults: number,
        maxHeartbeatAgeHours: number
    ): Promise<NetworkPeerDescriptor[]> {
        const query: GraphQLQuery = {
            query: `{
                stream(id: "${streamId}") {
                    sponsorships(where: { isRunning: true }) {
                        stakes(first: ${maxQueryResults}, orderBy: updateTimestamp, orderDirection: desc) {
                            operator (
                                where: {
                                    latestHeartbeatMetadata_contains: "\\"tls\\":true", 
                                    latestHeartbeatTimestamp_gt: "${Math.floor(Date.now() / 1000) - maxHeartbeatAgeHours * 60 * 60}"
                                }
                            ) {
                                id
                                latestHeartbeatMetadata
                            }
                        }
                    }
                }
            }`
        }
        const result = await this.theGraphClient.queryEntity<StreamOperators>(query)
        const peerDescriptors: NetworkPeerDescriptor[] = result.stream.sponsorships.flatMap(
            (sponsorship: Sponsorship) =>
                sponsorship.stakes.map((stake: { operator: OperatorMetadata }) =>
                    JSON.parse(stake.operator.latestHeartbeatMetadata)
                )
        )
        return peerDescriptors
    }
}
