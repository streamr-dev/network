import { BigNumber, Contract } from 'ethers'
import { Operator, StreamrConfig, operatorABI, streamrConfigABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from './OperatorPlugin'
import { EthereumAddress } from 'streamr-client'
import { Logger, TheGraphClient, toEthereumAddress } from '@streamr/utils'
import fetch from 'node-fetch'

const logger = new Logger(module)

export class MaintainOperatorValueHelper {
    private readonly operator: Operator
    private readonly theGraphClient: TheGraphClient
    private readonly config: OperatorServiceConfig

    constructor(config: OperatorServiceConfig) {
        this.config = config
        this.operator = new Contract(config.operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
        this.theGraphClient = new TheGraphClient({
            serverUrl: config.theGraphUrl,
            fetch,
            logger
        })
    }

    // returns a wei value (1 ETH means 100%)
    async getPenaltyLimitFraction(): Promise<bigint> {
        const streamrConfigAddress = await this.operator.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, this.config.provider) as unknown as StreamrConfig
        return (await streamrConfig.poolValueDriftLimitFraction()).toBigInt()
    }

    // returns a wei value (1 ETH means 100%)
    async getOperatorsShareFraction(operatorContractAddress?: EthereumAddress): Promise<bigint> {
        const operator = operatorContractAddress
            ? new Contract(operatorContractAddress, operatorABI, this.config.provider) as unknown as Operator
            : this.operator
        return (await operator.operatorsShareFraction()).toBigInt()
    }

    // ethers5 handles BigIng as BigNumber, but once it's upgrated to ethers6, it will be changed to BigInt (see ETH-536)
    async getEarningsFromSponsorships(operatorContractAddress?: EthereumAddress): Promise<{
        sponsorshipAddresses: string[]
        earnings: BigNumber[]
    }> {
        const operator = operatorContractAddress
            ? new Contract(operatorContractAddress, operatorABI, this.config.provider) as unknown as Operator
            : this.operator
        return await operator.getEarningsFromSponsorships()
    }

    async getApproximatePoolValue(operatorContractAddress?: EthereumAddress): Promise<bigint> {
        const operator = operatorContractAddress
            ? new Contract(operatorContractAddress, operatorABI, this.config.provider) as unknown as Operator
            : this.operator
        return (await operator.totalValueInSponsorshipsWei()).toBigInt()
    }

    async withdrawEarningsFromSponsorships(sponsorshipAddresses: string[]): Promise<void> {
        logger.info(`Withdraw earnings from ${sponsorshipAddresses.length} sponsorships`, { sponsorshipAddresses })
        await (await this.operator.withdrawEarningsFromSponsorships(sponsorshipAddresses)).wait()
    }

    async getRandomOperator(): Promise<EthereumAddress> {
        const latestBlock = await this.operator.provider.getBlockNumber()
        const queryFilter = '' // e.g. (first: 10, orderBy: poolValue, orderDirection: desc)
        const operatorIds = await this.getOperatorIds(latestBlock, queryFilter)
        logger.info(`Found ${operatorIds.length} operators`, { operatorIds })
        const randomIndex = this.getRandomInt(operatorIds.length)
        return operatorIds[randomIndex]
    }

    private getRandomInt(max = 10): number {
        return Math.floor(Math.random() * max)
    }

    private async getOperatorIds(requiredBlockNumber: number, queryFilter: string): Promise<EthereumAddress[]> {
        const createQuery = () => {
            return {
                query: `
                    {
                        operators${queryFilter} {
                            id
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
            if (!response.operators) {
                logger.error('Unable to find operators in The Graph')
                return []
            }
            return response.operators
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<any>(createQuery, parseItems)

        const operatorIds: EthereumAddress[] = []
        for await (const operator of queryResult) {
            operatorIds.push(toEthereumAddress(operator.id))
        }
        return operatorIds
    }
}
