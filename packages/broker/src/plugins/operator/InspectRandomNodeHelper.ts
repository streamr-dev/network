import { Contract } from '@ethersproject/contracts'
import { operatorABI } from '@streamr/network-contracts'
import type { Operator } from '@streamr/network-contracts'
import { EthereumAddress, Logger, TheGraphClient, toEthereumAddress } from '@streamr/utils'
import { OperatorServiceConfig } from './OperatorPlugin'
import fetch from 'node-fetch'

const logger = new Logger(module)

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

    async getSponsorshipsOfOperator(operatorAddress: EthereumAddress, requiredBlockNumber: number): Promise<EthereumAddress[]> {
        
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        operator(id: "${operatorAddress}") {
                            stakes(where: {id_gt: "${lastId}"}, first: ${pageSize}) {
                                id
                                sponsorship {
                                    id
                                }
                            }
                        }
                    }
                    `
            }
        }
        const parseItems = (response: { operator?: { stakes: { id: string, sponsorship: { id: string } }[] } }): 
        { id: string, sponsorship: { id: string } }[] => {
            if (!response.operator) {
                return []
            }
            return response.operator.stakes
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<{ id: string, sponsorship: { id: string } }>(createQuery, parseItems)
        const sponsorshipIds = new Set<EthereumAddress>()
        for await (const stake of queryResult) {
            sponsorshipIds.add(toEthereumAddress(stake.sponsorship?.id))
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
        const parseItems = (response: { sponsorship?: { stakes: { id: string, operator: { id: string } }[] } } ):
        { id: string, operator: { id: string } }[] => {
            if (!response.sponsorship) {
                return []
            }
            return response.sponsorship.stakes
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<{ id: string, operator: { id: string } }>(createQuery, parseItems)
        const operatorIds = new Set<EthereumAddress>()
        for await (const stake of queryResult) {
            operatorIds.add(toEthereumAddress(stake.operator?.id))
        }
        return Array.from(operatorIds)
    }

    async flagWithMetadata(sponsorship: EthereumAddress, operator: EthereumAddress, partition: number): Promise<void> {
        const metadata = JSON.stringify({ partition })
        await (await this.operatorContract.flagWithMetadata(sponsorship, operator, metadata)).wait()
    }
    
}
