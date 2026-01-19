import { Logger, TheGraphClient, GraphQLQuery, EthereumAddress, toEthereumAddress, type StreamID } from '@streamr/utils'
import shuffle from 'lodash/shuffle'
import { Lifecycle, scoped } from 'tsyringe'
import type { NetworkPeerDescriptor } from '../ConfigTypes'
import { LoggerFactory } from '../utils/LoggerFactory'

// TODO maybe this class could be removed/renamed (the method could be extracted to be a function as there is no state)

interface OperatorMetadata {
    id: string
    latestHeartbeatMetadata: string
}

export interface FindOperatorsOnStreamResult {
    operatorId: EthereumAddress
    peerDescriptor: NetworkPeerDescriptor
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

    constructor(
        theGraphClient: TheGraphClient,
        loggerFactory: LoggerFactory
    ) {
        this.theGraphClient = theGraphClient
        this.logger = loggerFactory.createLogger('OperatorRegistry')
    }

    async findRandomNetworkEntrypoints(
        maxEntryPoints: number,
        maxQueryResults: number, 
        maxHeartbeatAgeHours: number,
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

    async findOperatorsOnStream(streamId: StreamID, maxQueryResults: number, maxHeartbeatAgeHours: number): 
    Promise<FindOperatorsOnStreamResult[]> {
        const query: GraphQLQuery = { 
            query: `{
                stream(id: "${streamId}") {
                    sponsorships(where: { isRunning: true }) {
                        stakes(first: ${maxQueryResults}, orderBy: updateTimestamp, orderDirection: desc) {
                            operator (
                                where: {
                                    latestHeartbeatMetadata_contains: "\\"tls\\":true", 
                                    latestHeartbeatTimestamp_gt: "${Math.floor(Date.now() / 1000) - (maxHeartbeatAgeHours * 60 * 60)}"
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
        const queryResult = await this.theGraphClient.queryEntity<StreamOperators>(query)
        const operatorPeerDescriptors: FindOperatorsOnStreamResult[] = queryResult.stream.sponsorships
            .flatMap((sponsorship: Sponsorship) => sponsorship.stakes
                .map((stake: { operator: OperatorMetadata }) => ({
                    operatorId: toEthereumAddress(stake.operator.id),
                    peerDescriptor: JSON.parse(stake.operator.latestHeartbeatMetadata)
                })))
        return operatorPeerDescriptors
    }

}
