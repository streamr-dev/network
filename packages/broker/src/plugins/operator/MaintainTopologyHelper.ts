import { Contract } from "@ethersproject/contracts"
import { Provider } from "@ethersproject/providers"
import { operatorABI, sponsorshipABI } from "@streamr/network-contracts"
import type { Operator, Sponsorship } from "@streamr/network-contracts"
import { EventEmitter } from "eventemitter3"
import { Logger, TheGraphClient } from "@streamr/utils"
import { OperatorServiceConfig } from "./OperatorPlugin"

/**
 * Events emitted by {@link MaintainTopologyHelper}.
 */
export interface MaintainTopologyHelperEvents {
    /**
     * Emitted if an error occurred in the subscription.
     */
    error: (err: Error) => void

    /**
     * Emitted when staking into a Sponsorship on a stream that we haven't staked on before (in another Sponsorship)
     */
    addStakedStream: (streamIds: string[]) => void

    /**
     * Emitted when a unstaked from ALL Sponsorships for the given stream
     */
    removeStakedStream: (streamId: string) => void
}

export class MaintainTopologyHelper extends EventEmitter<MaintainTopologyHelperEvents> {
    provider: Provider
    address: string
    contract: Operator
    streamIdOfSponsorship: Map<string, string> = new Map()
    sponsorshipCountOfStream: Map<string, number> = new Map()
    theGraphClient: TheGraphClient
    private readonly logger = new Logger(module)

    constructor(config: OperatorServiceConfig) {
        super()

        this.logger.trace('OperatorClient created')
        this.theGraphClient = new TheGraphClient({
            serverUrl: config.theGraphUrl,
            fetch: config.fetch,
            logger: this.logger
        })
        this.address = config.operatorContractAddress
        this.provider = config.provider
        this.contract = new Contract(config.operatorContractAddress, operatorABI, this.provider) as unknown as Operator
        this.logger.info(`OperatorClient created for ${config.operatorContractAddress}`)
    }

    async start(): Promise<void> {
        this.logger.info("Starting OperatorClient")
        this.logger.info("Subscribing to Staked and Unstaked events")
        const latestBlock = await this.contract.provider.getBlockNumber()
        this.contract.on("Staked", async (sponsorship: string) => {
            this.logger.info(`got Staked event ${sponsorship}`)
            const sponsorshipAddress = sponsorship.toLowerCase()
            const streamId = await this.getStreamId(sponsorshipAddress)
            if (this.streamIdOfSponsorship.has(sponsorshipAddress)) {
                this.logger.info(`Sponsorship ${sponsorship} already staked into, ignoring`)
                return
            }
            this.streamIdOfSponsorship.set(sponsorshipAddress, streamId)

            const sponsorshipCount = (this.sponsorshipCountOfStream.get(streamId) || 0) + 1
            this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
            if (sponsorshipCount === 1) {
                this.emit("addStakedStream", [streamId])
            }
        })
        this.contract.on("Unstaked", async (sponsorship: string) => {
            this.logger.info(`got Unstaked event ${sponsorship}`)
            const sponsorshipAddress = sponsorship.toLowerCase()
            const streamId = this.streamIdOfSponsorship.get(sponsorshipAddress)
            if (!streamId) {
                this.logger.error("Sponsorship not found!")
                return
            }
            this.streamIdOfSponsorship.delete(sponsorshipAddress)
            const sponsorshipCount = (this.sponsorshipCountOfStream.get(streamId) || 1) - 1
            this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
            if (sponsorshipCount === 0) {
                this.sponsorshipCountOfStream.delete(streamId)
                this.emit("removeStakedStream", streamId)
            }
        })
        
        const initalStreams = await this.pullStakedStreams(latestBlock)
        if (initalStreams.length > 0) {
            this.emit("addStakedStream", initalStreams)
        }
    }

    async getStreamId(sponsorshipAddress: string): Promise<string> {
        const bounty = new Contract(sponsorshipAddress, sponsorshipABI, this.contract.provider as Provider) as unknown as Sponsorship
        return bounty.streamId()
    }

    private async pullStakedStreams(requiredBlockNumber: number): Promise<string[]> {
        this.logger.info(`getStakedStreams for ${this.address.toLowerCase()}`)
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        operator(id: "${this.address.toLowerCase()}") {
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
                this.logger.error(`Operator ${this.address.toLowerCase()} not found in TheGraph`)
                return []
            }
            return response.operator.stakes
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<any>(createQuery, parseItems)

        for await (const stake of queryResult) {
            if (stake.sponsorship.stream && stake.sponsorship.stream.id
                && this.streamIdOfSponsorship.get(stake.sponsorship.id) !== stake.sponsorship.stream.id) {
                const streamId = stake.sponsorship.stream.id
                this.streamIdOfSponsorship.set(stake.sponsorship.id, stake.sponsorship.stream.id)
                const sponsorshipCount = (this.sponsorshipCountOfStream.get(streamId) || 0) + 1
                this.sponsorshipCountOfStream.set(streamId, sponsorshipCount)
                this.logger.info(`added ${stake.sponsorship.id} to stream ${streamId} with sponsorshipCount ${sponsorshipCount}`)
            }
        }
        return Array.from(this.sponsorshipCountOfStream.keys())
    }

    stop(): void {
        this.provider.removeAllListeners()
        this.removeAllListeners()
    }
}
