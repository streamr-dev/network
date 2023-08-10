import { Contract } from "@ethersproject/contracts"
import { Provider } from "@ethersproject/providers"
import { operatorABI } from "@streamr/network-contracts"
import type { Operator } from "@streamr/network-contracts"
import { EthereumAddress, Logger, TheGraphClient, toEthereumAddress } from "@streamr/utils"
import { OperatorServiceConfig } from "./OperatorPlugin"
import fetch from 'node-fetch'

const logger = new Logger(module)

export class InspectRandomNodeHelper {

    private readonly operatorContractAddress: EthereumAddress
    private readonly provider: Provider
    private readonly operatorContract: Operator
    private readonly theGraphClient: TheGraphClient

    constructor({ operatorContractAddress, provider, theGraphUrl }: OperatorServiceConfig) {
        this.operatorContractAddress = operatorContractAddress
        this.provider = provider
        this.operatorContract = new Contract(operatorContractAddress, operatorABI, this.provider) as unknown as Operator
        this.theGraphClient = new TheGraphClient({
            serverUrl: theGraphUrl,
            fetch,
            logger
        })
    }

    async getSponsorshipsOfOperator(operatorAddress: EthereumAddress, requiredBlockNumber: number): Promise<EthereumAddress[]> {
        
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        operator(id: "${operatorAddress}") {
                            stakes(where: {id_gt: "${lastId}"}, first: ${pageSize}) {
                                sponsorship {
                                    id
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
                logger.error('Unable to find operator in The Graph', { operatorContractAddress: this.operatorContractAddress })
                return []
            }
            return response.operator.stakes
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<any>(createQuery, parseItems) // TODO: add type
        const sponsorshipIds = new Set<EthereumAddress>()
        for await (const stake of queryResult) {
            const sponsorshipId = stake.sponsorship?.id
            if (sponsorshipId) {
                sponsorshipIds.add(toEthereumAddress(sponsorshipId))
            }
        }
        return Array.from(sponsorshipIds)
    }

    async getOperatorsInSponsorship(sponsorshipAddress: EthereumAddress, requiredBlockNumber: number): Promise<EthereumAddress[]> {
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        sponsorship(id: "${sponsorshipAddress}") {
                            stakes(where: {id_gt: "${lastId}"}, first: ${pageSize}) {
                                operator {
                                    id
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
            if (!response.sponsorship) {
                logger.error('Unable to find sponsorship in The Graph', { sponsorshipAddress })
                return []
            }
            return response.sponsorship.stakes
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<any>(createQuery, parseItems) // TODO: add type
        const operatorIds = new Set<EthereumAddress>()
        for await (const stake of queryResult) {
            const operatorId = stake.operator?.id
            if (operatorId) {
                operatorIds.add(toEthereumAddress(operatorId))
            }
        }
        return Array.from(operatorIds)
    }

    async flag(sponsorship: string, operator: string): Promise<void> {
        await (await this.operatorContract.flag(sponsorship, operator)).wait()
    }
    
}
