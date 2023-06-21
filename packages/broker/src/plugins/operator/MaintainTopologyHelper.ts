import { Contract } from "@ethersproject/contracts"
import { Provider } from "@ethersproject/providers"
import { operatorABI, sponsorshipABI } from "@streamr/network-contracts"
import type { Operator, Sponsorship } from "@streamr/network-contracts"
import { EventEmitter } from "eventemitter3"
import { EthereumAddress, Logger, TheGraphClient, toEthereumAddress } from "@streamr/utils"
import { OperatorServiceConfig } from "./OperatorPlugin"
import { StreamID, toStreamID } from '@streamr/protocol'
import fetch from 'node-fetch'

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
    addStakedStream: (streamIds: StreamID[]) => void

    /**
     * Emitted when un-staked from all Sponsorships for the given stream
     */
    removeStakedStream: (streamId: StreamID) => void
}

export class MaintainTopologyHelper extends EventEmitter<MaintainTopologyHelperEvents> {
    private readonly streamIdOfSponsorship: Map<EthereumAddress, StreamID> = new Map()
    private readonly sponsorshipCountOfStream: Map<StreamID, number> = new Map()
    private readonly operatorContractAddress: EthereumAddress
    private readonly provider: Provider
    private readonly operatorContract: Operator
    private readonly theGraphClient: TheGraphClient

    constructor({ operatorContractAddress, provider, theGraphUrl }: OperatorServiceConfig) {
        super()
        this.operatorContractAddress = operatorContractAddress
        this.provider = provider
        this.operatorContract = new Contract(operatorContractAddress, operatorABI, this.provider) as unknown as Operator
        this.theGraphClient = new TheGraphClient({
            serverUrl: theGraphUrl,
            fetch,
            logger
        })
    }

    async start(): Promise<void> {
        logger.info('Starting')
        const latestBlock = await this.operatorContract.provider.getBlockNumber()

        this.operatorContract.on('Staked', async (sponsorship: string) => {
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
                this.emit('addStakedStream', [streamId])
            }
        })
        this.operatorContract.on('Unstaked', (sponsorship: string) => {
            logger.info('Receive "Unstaked" event', { sponsorship })
            const sponsorshipAddress = toEthereumAddress(sponsorship)
            const streamId = this.streamIdOfSponsorship.get(sponsorshipAddress)
            if (streamId === undefined) {
                logger.debug('Unable to find streamId for sponsorship', { sponsorshipAddress })
                return
            }
            this.streamIdOfSponsorship.delete(sponsorshipAddress)
            const sponsorshipCount = (this.sponsorshipCountOfStream.get(streamId) ?? 1) - 1
            this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
            if (sponsorshipCount === 0) {
                this.sponsorshipCountOfStream.delete(streamId)
                this.emit('removeStakedStream', streamId)
            }
        })
        
        const initialStreams = await this.pullStakedStreams(latestBlock)
        if (initialStreams.length > 0) {
            this.emit('addStakedStream', initialStreams)
        }
    }

    async getStreamId(sponsorshipAddress: string): Promise<StreamID> {
        const bounty = new Contract(sponsorshipAddress, sponsorshipABI, this.operatorContract.provider as Provider) as unknown as Sponsorship
        return toStreamID(await bounty.streamId())
    }

    private async pullStakedStreams(requiredBlockNumber: number): Promise<StreamID[]> {
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        operator(id: "${this.operatorContractAddress}") {
                            stakes(where: {id_gt: "${lastId}"}, first: ${pageSize}) {
                                sponsorship {
                                  id
                                  stream {
                                    id
                                  }
                                }
                              }
                        }
                        _meta {
                            block {
                            number
                            }
                        }
                    }
                    `
            }
        }
        const parseItems = (response: any) => {
            if (!response.operator) {
                logger.debug('Unable to find operator in The Graph', { operatorContractAddress: this.operatorContractAddress })
                return []
            }
            return response.operator.stakes
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<any>(createQuery, parseItems) // TODO: add type

        for await (const stake of queryResult) {
            const sponsorshipId = stake.sponsorship?.id
            const streamId = toStreamIDSafe(stake.sponsorship?.stream?.id)
            if (streamId !== undefined && sponsorshipId !== undefined && this.streamIdOfSponsorship.get(sponsorshipId) !== streamId) {
                this.streamIdOfSponsorship.set(sponsorshipId, streamId)
                const sponsorshipCount = (this.sponsorshipCountOfStream.get(streamId) || 0) + 1
                this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
            }
        }
        return Array.from(this.sponsorshipCountOfStream.keys())
    }

    stop(): void {
        // TODO: remove our listeners from operatorContract
        this.removeAllListeners()
    }
}
