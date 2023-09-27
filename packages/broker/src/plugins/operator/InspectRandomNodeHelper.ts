import { Contract } from '@ethersproject/contracts'
import { operatorABI } from '@streamr/network-contracts'
import type { Operator } from '@streamr/network-contracts'
import { EthereumAddress, Logger, TheGraphClient, toEthereumAddress } from '@streamr/utils'
import { OperatorServiceConfig } from './OperatorPlugin'
import fetch from 'node-fetch'
import { StreamID, toStreamID } from '@streamr/protocol'

const logger = new Logger(module)

export interface SponsorshipResult {
    sponsorshipAddress: EthereumAddress
    streamId: StreamID
    operatorCount: number
}

export class InspectRandomNodeHelper {
    private readonly operatorContract: Operator
    private readonly theGraphClient: TheGraphClient

    constructor(config: OperatorServiceConfig) {
        this.operatorContract = new Contract(config.operatorContractAddress, operatorABI, config.signer) as unknown as Operator
        this.theGraphClient = new TheGraphClient({
            serverUrl: config.theGraphUrl,
            fetch,
            logger
        })
    }

    async getSponsorshipsOfOperator(operatorAddress: EthereumAddress): Promise<SponsorshipResult[]> {
        interface Stake {
            id: string
            sponsorship: {
                id: string
                operatorCount: number
                stream: {
                    id: string
                }
            }
        }
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        operator(id: "${operatorAddress}") {
                            stakes(where: {id_gt: "${lastId}"}, first: ${pageSize}) {
                                id
                                sponsorship {
                                    id
                                    operatorCount
                                    stream {
                                        id
                                    }
                                }
                            }
                        }
                    }
                    `
            }
        }
        const parseItems = (response: { operator?: { stakes: Stake[] } }): Stake[] => {
            return response.operator?.stakes ?? []
        }
        const queryResult = this.theGraphClient.queryEntities<Stake>(createQuery, parseItems)
        const results: SponsorshipResult[] = []
        for await (const stake of queryResult) {
            results.push({
                sponsorshipAddress: toEthereumAddress(stake.sponsorship.id),
                streamId: toStreamID(stake.sponsorship.stream.id),
                operatorCount: stake.sponsorship.operatorCount
            })
        }
        return results
    }

    async getOperatorsInSponsorship(sponsorshipAddress: EthereumAddress): Promise<EthereumAddress[]> {
        interface Stake {
            id: string
            operator: {
                id: string
            }
        }
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        sponsorship(id: "${sponsorshipAddress}") {
                            stakes(where: {id_gt: "${lastId}"}, first: ${pageSize}) {
                                id
                                operator {
                                    id
                                }
                            }
                        }
                    }
                    `
            }
        }
        const parseItems = (response: { sponsorship?: { stakes: Stake[] } } ): Stake[] => {
            return response.sponsorship?.stakes ?? []
        }
        const queryResult = this.theGraphClient.queryEntities<Stake>(createQuery, parseItems)
        const operatorIds: EthereumAddress[] = []
        for await (const stake of queryResult) {
            operatorIds.push(toEthereumAddress(stake.operator.id))
        }
        return operatorIds
    }

    async flag(sponsorship: EthereumAddress, operator: EthereumAddress, partition: number): Promise<void> {
        const metadata = JSON.stringify({ partition })
        await (await this.operatorContract.flag(sponsorship, operator, metadata)).wait()
    }
    
}
