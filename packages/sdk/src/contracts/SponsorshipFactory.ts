import { SponsorshipFactoryABI } from '@streamr/network-contracts'
import { EthereumAddress, StreamID, toEthereumAddress, toStreamID } from '@streamr/utils'
import { Interface } from 'ethers'
import { Lifecycle, inject, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../ConfigTypes'
import { StreamrClientEventEmitter } from '../events'
import { LoggerFactory } from '../utils/LoggerFactory'
import { ChainEventPoller } from './ChainEventPoller'
import { initContractEventGateway } from './contract'

export interface SponsorshipCreatedEvent {
    readonly sponsorshipContractAddress: EthereumAddress
    readonly streamId: StreamID
    readonly blockNumber: number
}

@scoped(Lifecycle.ContainerScoped)
export class SponsorshipFactory {
    private readonly config: Pick<StrictStreamrClientConfig, 'contracts'>

    constructor(
        chainEventPoller: ChainEventPoller,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>,
        eventEmitter: StreamrClientEventEmitter,
        loggerFactory: LoggerFactory
    ) {
        this.config = config
        this.initEventListener(eventEmitter, chainEventPoller, loggerFactory)
    }

    private initEventListener(
        eventEmitter: StreamrClientEventEmitter,
        chainEventPoller: ChainEventPoller,
        loggerFactory: LoggerFactory
    ) {
        const transformation = ([sponsorshipContract, streamId]: [string, string], blockNumber: number) => ({
            sponsorshipContractAddress: toEthereumAddress(sponsorshipContract),
            streamId: toStreamID(streamId),
            blockNumber
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
