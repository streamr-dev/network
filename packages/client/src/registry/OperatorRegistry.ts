import { Lifecycle, inject, scoped } from 'tsyringe'
import { TheGraphClient, Logger } from '@streamr/utils'
import { ConfigInjectionToken, StrictStreamrClientConfig, NetworkPeerDescriptor } from '../Config'
import { LoggerFactory } from '../utils/LoggerFactory'

@scoped(Lifecycle.ContainerScoped)
export class OperatorRegistry {
    private readonly theGraphClient: TheGraphClient
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts'>
    private readonly logger: Logger

    constructor(
        theGraphClient: TheGraphClient,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>,
        loggerFactory: LoggerFactory
    ) {
        this.theGraphClient = theGraphClient
        this.config = config
        this.logger = loggerFactory.createLogger(module)
    }

    async findNetworkEntrypoints(
        limit: number = 20,
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
                        first: ${limit}
                        where: {latestHeartbeatMetadata_contains: "\\"tls\\":true"}
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
        this.logger.debug(`Discovered ${peerDescriptors.length} network entrypoints`, { entryPoints: peerDescriptors})
        return peerDescriptors
    }
}
