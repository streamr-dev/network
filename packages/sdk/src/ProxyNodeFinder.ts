import { Lifecycle, scoped } from 'tsyringe'
import { StreamDefinition } from './types'
import { NetworkNodeFacade } from './NetworkNodeFacade'
import { NetworkPeerDescriptor } from './Config'
import { StreamIDBuilder, DEFAULT_PARTITION } from './StreamIDBuilder'
import { OperatorRegistry } from './contracts/OperatorRegistry'
import { LoggerFactory } from './utils/LoggerFactory'
import { Logger, toStreamPartID } from '@streamr/utils'
import shuffle from 'lodash/shuffle'
import sample from 'lodash/sample'

@scoped(Lifecycle.ContainerScoped)
export class ProxyNodeFinder {

    private readonly streamIdBuilder: StreamIDBuilder
    private readonly operatorRegistry: OperatorRegistry
    private readonly node: NetworkNodeFacade
    private readonly logger: Logger

    constructor(
        streamIdBuilder: StreamIDBuilder,
        operatorRegistry: OperatorRegistry,
        node: NetworkNodeFacade,
        loggerFactory: LoggerFactory
    ) {
        this.streamIdBuilder = streamIdBuilder
        this.operatorRegistry = operatorRegistry
        this.node = node
        this.logger = loggerFactory.createLogger('ProxyNodeFinder')
    }

    async find(streamDefinition: StreamDefinition, 
        numberOfProxies: number = 1, 
        maxQueryResults: number = 100,
        maxHeartbeatAgeHours: number = 24
    ): Promise<NetworkPeerDescriptor[]> {
        const [streamId, partition] = await this.streamIdBuilder.toStreamPartElements(streamDefinition)
        this.logger.debug(`Trying to find ${numberOfProxies} proxy nodes for stream ${streamId} partition ${partition}`)

        // Find active operators on the stream
        const foundOperators = await this.operatorRegistry.findOperatorsOnStream(streamId, maxQueryResults, maxHeartbeatAgeHours)
        this.logger.debug(`Found ${foundOperators.length} operators on stream ${streamId}`)
        
        // Throw early if we don't even have a chance of finding enough proxies (we accept one per operator)
        if (foundOperators.length < numberOfProxies) {
            throw new Error(`Not enough operators found for stream ${streamId}: found ${
                foundOperators.length} operators, but ${numberOfProxies} are required`)
        }
        
        const shuffledOperators = shuffle(foundOperators)
        const foundProxies: NetworkPeerDescriptor[] = []

        // This shared promise is used to signal that enough proxies have been found
        // It's a speed optimization to avoid waiting for all workers to complete if we already have enough nodes
        let signalEnoughProxiesFound: () => void = () => {}
        const enoughProxiesFoundPromise = new Promise<void>((resolve) => {
            signalEnoughProxiesFound = resolve
        })

        // Try to find numOfProxies nodes from the shuffled operators
        // We search in parallel, with parallelism = numOfProxies
        // If there's an error, try the next operator
        let operatorIndex = 0
        const startNodeDiscoveryWorker = async (workerIndex: number) => {
            while (operatorIndex < shuffledOperators.length && foundProxies.length < numberOfProxies) {
                const operator = shuffledOperators[operatorIndex]
                operatorIndex++
                const streamPartId = toStreamPartID(streamId, partition ?? DEFAULT_PARTITION)
                try {
                    const nodes = await this.node.discoverOperators(operator.peerDescriptor, streamPartId)

                    if (nodes.length > 0) {
                        // One more check to make sure the other racing threads didn't already find enough nodes
                        if (foundProxies.length < numberOfProxies) {
                            this.logger.debug(`(worker ${workerIndex}): found ${nodes.length} nodes for operator ${
                                operator.operatorId} and streamPartId ${streamPartId}`)
        
                            foundProxies.push(sample(nodes)!)

                            if (foundProxies.length >= numberOfProxies) {
                                // Signal that enough proxies have been found, this will resolve the race
                                // and ignore any further results from the other workers
                                signalEnoughProxiesFound()
                            }
                        } else {
                            // silently drop the result, enough have been found already
                        }
                    } else {
                        this.logger.debug(`(worker ${workerIndex}): no nodes found for operator ${
                            operator.operatorId} and streamPartId ${streamPartId}`)
                    }
                } catch (error) {
                    this.logger.error(`(worker ${workerIndex}): error discovering nodes for operator ${
                        operator.operatorId}: ${(error as Error).message}`)
                }
            }
        }

        // Start numberOfProxies discovery workers in parallel
        // The race will resolve as soon as they signal that they 
        // found enough nodes (success) or the workers complete (failure)
        await Promise.race([
            Promise.all(Array.from({ length: numberOfProxies }, (_, index) => startNodeDiscoveryWorker(index))),
            enoughProxiesFoundPromise
        ])

        if (foundProxies.length < numberOfProxies) {
            throw new Error(`Not enough proxy nodes were resolved for stream ${streamId}: found ${
                foundProxies.length} nodes, but ${numberOfProxies} are required`)
        }
        return foundProxies
    }
}
