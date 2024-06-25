import { StreamID, toStreamID } from '@streamr/protocol'
import { OperatorContractFacade, StakeEvent } from '@streamr/sdk'
import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'

const logger = new Logger(module)

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
    private onStakedListener?: (sponsorship: StakeEvent) => unknown
    private onUnstakedListener?: (sponsorship: StakeEvent) => unknown
    private readonly contractFacade: OperatorContractFacade

    constructor(contractFacade: OperatorContractFacade) {
        super()
        this.contractFacade = contractFacade
    }

    async start(): Promise<void> {
        const latestBlock = await this.contractFacade.getCurrentBlockNumber()

        this.onStakedListener = async (event: StakeEvent) => {
            const sponsorship = event.sponsorship
            logger.info('Receive "Staked" event', { sponsorship })
            const sponsorshipAddress = toEthereumAddress(sponsorship)
            const streamId = await this.contractFacade.getStreamId(sponsorshipAddress) // TODO: add catching here
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
        }
        this.contractFacade.on('staked', this.onStakedListener)
        this.onUnstakedListener = (event: StakeEvent) => {
            const sponsorship = event.sponsorship
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
        }
        this.contractFacade.on('unstaked', this.onUnstakedListener)
        
        const queryResult = this.contractFacade.pullStakedStreams(latestBlock)
        for await (const stake of queryResult) {
            const sponsorshipId = toEthereumAddress(stake.sponsorship.id)
            const streamId = toStreamID(stake.sponsorship.stream.id)
            if (this.streamIdOfSponsorship.get(sponsorshipId) !== streamId) {
                this.streamIdOfSponsorship.set(sponsorshipId, streamId)
                const sponsorshipCount = (this.sponsorshipCountOfStream.get(streamId) || 0) + 1
                this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
            }
        }
        if (this.sponsorshipCountOfStream.size > 0) {
            const initialStreams = Array.from(this.sponsorshipCountOfStream.keys())
            this.emit('addStakedStreams', initialStreams)
        }
    }

    stop(): void {
        this.contractFacade.off('staked', this.onStakedListener!)
        this.contractFacade.off('unstaked', this.onUnstakedListener!)
        this.removeAllListeners()
    }
}
