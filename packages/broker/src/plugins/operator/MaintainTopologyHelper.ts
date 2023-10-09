import { Contract } from '@ethersproject/contracts'
import type { Sponsorship } from '@streamr/network-contracts'
import { sponsorshipABI } from '@streamr/network-contracts'
import { StreamID, toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { ContractFacade } from './ContractFacade'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

function toStreamIDSafe(input: string): StreamID | undefined {
    try {
        return toStreamID(input)
    } catch {
        return undefined
    }
}

export interface MaintainTopologyHelperEvents {
    /**
     * Emitted when staking into a Sponsorship on a stream that we haven't staked on before (in another Sponsorship)
     */
    addStakedStreams: (streamIds: StreamID[]) => void

    /**
     * Emitted when un-staked from all Sponsorships for the given stream
     */
    removeStakedStream: (streamId: StreamID) => void
}

export class MaintainTopologyHelper extends EventEmitter<MaintainTopologyHelperEvents> {
    private readonly streamIdOfSponsorship: Map<EthereumAddress, StreamID> = new Map()
    private readonly sponsorshipCountOfStream: Map<StreamID, number> = new Map()
    private readonly contractFacade: ContractFacade

    constructor(config: OperatorServiceConfig) {
        super()
        this.contractFacade = new ContractFacade(config)
    }

    async start(): Promise<void> {
        logger.info('Starting')
        const latestBlock = await this.contractFacade.operatorContract.provider.getBlockNumber()

        this.contractFacade.operatorContract.on('Staked', async (sponsorship: string) => {
            logger.info('Receive "Staked" event', { sponsorship })
            const sponsorshipAddress = toEthereumAddress(sponsorship)
            const streamId = await this.getStreamId(sponsorshipAddress) // TODO: add catching here
            if (this.streamIdOfSponsorship.has(sponsorshipAddress)) {
                logger.debug('Ignore already staked into sponsorship', { sponsorship })
                return
            }
            this.streamIdOfSponsorship.set(sponsorshipAddress, streamId)

            const sponsorshipCount = (this.sponsorshipCountOfStream.get(streamId) ?? 0) + 1
            this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
            if (sponsorshipCount === 1) {
                this.emit('addStakedStreams', [streamId])
            }
        })
        this.contractFacade.operatorContract.on('Unstaked', (sponsorship: string) => {
            logger.info('Receive "Unstaked" event', { sponsorship })
            const sponsorshipAddress = toEthereumAddress(sponsorship)
            const streamId = this.streamIdOfSponsorship.get(sponsorshipAddress)
            if (streamId === undefined) {
                logger.debug('Unable to find streamId for sponsorship', { sponsorshipAddress })
                return
            }
            this.streamIdOfSponsorship.delete(sponsorshipAddress)
            const sponsorshipCount = this.sponsorshipCountOfStream.get(streamId)! - 1
            this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
            if (sponsorshipCount === 0) {
                this.sponsorshipCountOfStream.delete(streamId)
                this.emit('removeStakedStream', streamId)
            }
        })
        
        const queryResult = await this.contractFacade.pullStakedStreams(latestBlock)
        for await (const stake of queryResult) {
            const sponsorshipId = stake.sponsorship?.id
            const streamId = toStreamIDSafe(stake.sponsorship?.stream?.id)
            // TODO: null-checks needed or being too defensive?
            if (streamId !== undefined && sponsorshipId !== undefined && this.streamIdOfSponsorship.get(sponsorshipId) !== streamId) {
                this.streamIdOfSponsorship.set(sponsorshipId, streamId)
                const sponsorshipCount = (this.sponsorshipCountOfStream.get(streamId) || 0) + 1
                this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
            }
        }
        const initialStreams = Array.from(this.sponsorshipCountOfStream.keys())
        if (initialStreams.length > 0) {
            this.emit('addStakedStreams', initialStreams)
        }
    }

    async getStreamId(sponsorshipAddress: string): Promise<StreamID> {
        const sponsorship = new Contract(sponsorshipAddress, sponsorshipABI, this.contractFacade.operatorContract.provider) as unknown as Sponsorship
        return toStreamID(await sponsorship.streamId())
    }

    stop(): void {
        // TODO can't remove all listeners!
        this.contractFacade.operatorContract.removeAllListeners()
        this.removeAllListeners()
    }
}
