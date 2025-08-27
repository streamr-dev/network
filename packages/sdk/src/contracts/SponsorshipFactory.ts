import { SponsorshipFactoryABI } from '@streamr/network-contracts'
import { EthereumAddress, Logger, StreamID, toEthereumAddress, toStreamID } from '@streamr/utils'
import { Interface } from 'ethers'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { StreamrClientEventEmitter } from '../events'
import { LoggerFactory } from '../utils/LoggerFactory'
import { ChainEventPoller } from './ChainEventPoller'
import { initContractEventGateway } from './contract'

export interface SponsorshipCreatedEvent {
    readonly sponsorshipContractAddress: EthereumAddress
    readonly streamId: StreamID
    readonly metadata: string
}

@scoped(Lifecycle.ContainerScoped)
export class SponsorshipFactory {
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts' | '_timeouts'>
    private readonly logger: Logger

    constructor(
        chainEventPoller: ChainEventPoller,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts' | 'cache' | '_timeouts'>,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.logger = loggerFactory.createLogger(module)
        this.initStreamAssignmentEventListeners(eventEmitter, chainEventPoller, loggerFactory)
    }

    private initStreamAssignmentEventListeners(
        eventEmitter: StreamrClientEventEmitter,
        chainEventPoller: ChainEventPoller,
        loggerFactory: LoggerFactory
    ) {
        const transformation = (sponsorshipContract: string, streamId: string, metadata: string) => ({
            sponsorshipContractAddress: toEthereumAddress(sponsorshipContract),
            streamId: toStreamID(streamId),
            metadata
        })
        const contractAddress = toEthereumAddress(this.config.contracts.sponsorshipFactoryChainAddress)
        const contractInterface = new Interface(SponsorshipFactoryABI)
        initContractEventGateway({
            sourceDefinition: {
                contractInterfaceFragment: contractInterface.getEvent('NewSponsorship')!,
                contractAddress
            },
            sourceEmitter: chainEventPoller,
            targetName: 'sponsorshipCreated',
            targetEmitter: eventEmitter,
            transformation,
            loggerFactory
        })
    }
}
