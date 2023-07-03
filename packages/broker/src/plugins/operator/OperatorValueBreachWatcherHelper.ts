import { Contract } from "@ethersproject/contracts"
import { Provider } from "@ethersproject/providers"
import { StreamrConfig, operatorABI, streamrConfigABI } from "@streamr/network-contracts"
import type { Operator } from "@streamr/network-contracts"
import { EthereumAddress, Logger, TheGraphClient, toEthereumAddress } from "@streamr/utils"
import { OperatorServiceConfig } from "./OperatorPlugin"
import fetch from 'node-fetch'
import { BigNumber } from "ethers"

const logger = new Logger(module)

export class OperatorValueBreachWatcherHelper {
    private readonly provider: Provider
    private readonly operator: Operator
    private readonly theGraphClient: TheGraphClient

    constructor({ operatorContractAddress, provider, theGraphUrl }: OperatorServiceConfig) {
        this.provider = provider
        this.operator = new Contract(operatorContractAddress, operatorABI, this.provider) as unknown as Operator
        this.theGraphClient = new TheGraphClient({
            serverUrl: theGraphUrl,
            fetch,
            logger
        })
    }

    async getRandomOperator(): Promise<EthereumAddress> {
        const latestBlock = await this.operator.provider.getBlockNumber()
        const queryFilter = '' // e.g. (first: 10, orderBy: poolValue, orderDirection: desc)
        const operatorIds = await this.getOperatorIds(latestBlock, queryFilter)
        logger.info(`Found ${operatorIds.length} operators`, { operatorIds })
        return operatorIds[0]
    }

    // ethers5 handles BigIng as BigNumber, but once it's upgrated to ethers6, it will be changed to BigInt (see ETH-536)
    async getApproximatePoolValuesPerSponsorship(operatorContractAddress: EthereumAddress): Promise<{
        sponsorshipAddresses: string[]
        approxValues: BigNumber[]
        realValues: BigNumber[]
    }> {
        const operatorContract = new Contract(operatorContractAddress, operatorABI, this.provider) as unknown as Operator
        return await operatorContract.getApproximatePoolValuesPerSponsorship()
    }

    // returns a wei value (1 ETH means 100%)
    async getPenaltyLimitFraction(): Promise<bigint> {
        const streamrConfigAddress = await this.operator.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, this.provider) as unknown as StreamrConfig
        return (await streamrConfig.poolValueDriftLimitFraction()).toBigInt()
    }

    async updateApproximatePoolValueOfSponsorships(sponsorshipAddresses: string[]): Promise<void> {
        await (await this.operator.updateApproximatePoolvalueOfSponsorships(sponsorshipAddresses)).wait()
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
