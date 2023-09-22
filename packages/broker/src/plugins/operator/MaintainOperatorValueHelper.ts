import { Contract } from 'ethers'
import { Operator, operatorABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from './OperatorPlugin'
import { EthereumAddress } from 'streamr-client'
import { Logger, TheGraphClient, toEthereumAddress } from '@streamr/utils'
import fetch from 'node-fetch'
import sample from 'lodash/sample'

const logger = new Logger(module)

interface EarningsData {
    sponsorshipAddresses: EthereumAddress[]
    sumDataWei: bigint
    rewardThresholdDataWei: bigint
}

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

    async getRandomOperator(): Promise<EthereumAddress | undefined> {
        const latestBlock = await this.operator.provider.getBlockNumber()
        const operators = await this.getOperatorAddresses(latestBlock)
        // filter out my own operator
        const operatorAddresses = operators.filter((id) => id !== this.config.operatorContractAddress)
        logger.debug(`Found ${operatorAddresses.length} operators`, { operatorAddresses })
        return sample(operatorAddresses)
    }

    /**
     * Find the sum of earnings in Sponsorships (that the Operator must withdraw before the sum reaches a limit),
     * SUBJECT TO the constraints, set in the OperatorServiceConfig:
     *  - only take at most maxSponsorshipsInWithdraw addresses (those with most earnings), or all if undefined
     *  - only take sponsorships that have more than minSponsorshipEarningsInWithdraw, or all if undefined
     * @param operatorContractAddress
     */
    async getEarningsOf(operatorContractAddress: EthereumAddress): Promise<EarningsData> {
        const operator = new Contract(operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
        const minSponsorshipEarningsInWithdrawWei = BigInt(this.config.minSponsorshipEarningsInWithdraw ?? 0)
        const {
            addresses: allSponsorshipAddresses,
            earnings,
            rewardThreshold,
        } = await operator.getSponsorshipsAndEarnings()

        const sponsorships = allSponsorshipAddresses
            .map((address, i) => ({ address, earnings: earnings[i].toBigInt() }))
            .filter((sponsorship) => sponsorship.earnings >= minSponsorshipEarningsInWithdrawWei)
            .sort((a, b) => Number(b.earnings - a.earnings)) // TODO: after Node 20, use .toSorted() instead
            .slice(0, this.config.maxSponsorshipsInWithdraw) // take all if maxSponsorshipsInWithdraw is undefined

        return {
            sponsorshipAddresses: sponsorships.map((sponsorship) => toEthereumAddress(sponsorship.address)),
            sumDataWei: sponsorships.reduce((sum, sponsorship) => sum += sponsorship.earnings, 0n),
            rewardThresholdDataWei: rewardThreshold.toBigInt()
        }
    }

    async getMyEarnings(): Promise<EarningsData> {
        return this.getEarningsOf(this.config.operatorContractAddress)
    }

    async withdrawMyEarningsFromSponsorships(sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await (await this.operator.withdrawEarningsFromSponsorships(sponsorshipAddresses)).wait()
    }

    async triggerWithdraw(targetOperatorAddress: EthereumAddress, sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await (await this.operator.triggerAnotherOperatorWithdraw(targetOperatorAddress, sponsorshipAddresses)).wait()
    }

    private async getOperatorAddresses(requiredBlockNumber: number): Promise<EthereumAddress[]> {
        const createQuery = () => {
            return {
                query: `
                    {
                        operators {
                            id
                        }
                    }
                    `
            }
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        const queryResult = this.theGraphClient.queryEntities<{ id: string }>(createQuery)

        const operatorAddresses: EthereumAddress[] = []
        for await (const operator of queryResult) {
            operatorAddresses.push(toEthereumAddress(operator.id))
        }
        return operatorAddresses
    }
}
