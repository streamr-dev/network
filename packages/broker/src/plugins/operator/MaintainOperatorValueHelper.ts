import { BigNumber, Contract } from 'ethers'
import { Operator, StreamrConfig, operatorABI, streamrConfigABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from './OperatorPlugin'
import { EthereumAddress } from 'streamr-client'
import { Logger, TheGraphClient, toEthereumAddress } from '@streamr/utils'
import fetch from 'node-fetch'

const logger = new Logger(module)

const ONE_ETHER = BigInt(1e18)

interface UnwithdrawnEarningsData {
    sumDataWei: bigint
    fraction: bigint
    sponsorshipAddresses: EthereumAddress[]
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

    async getRandomOperator(): Promise<EthereumAddress> {
        const latestBlock = await this.operator.provider.getBlockNumber()
        const queryFilter = '' // e.g. (first: 10, orderBy: poolValue, orderDirection: desc)
        const operators = await this.getOperatorAddresses(latestBlock, queryFilter)
        // filter out my own operator
        const operatorAddresses = operators.filter((id) => id !== this.config.operatorContractAddress)
        logger.info(`Found ${operatorAddresses.length} operators`, { operatorAddresses })
        const randomIndex = Math.floor(Math.random() * operatorAddresses.length)
        return operatorAddresses[randomIndex]
    }

    /**
     * The "hard limit" for paying out rewards to `withdrawEarningsFromSponsorships` caller.
     * Operator is expected to call `withdrawEarningsFromSponsorships` before
     *   `unwithdrawn earnings / (total staked + free funds)` exceeds this limit.
     * @returns a "wei" fraction: 1e18 or "1 ether" means limit is at unwithdrawn earnings == total staked + free funds
     */
    async getPenaltyLimitFraction(): Promise<bigint> {
        const streamrConfigAddress = await this.operator.streamrConfig()
        const streamrConfig = new Contract(streamrConfigAddress, streamrConfigABI, this.config.provider) as unknown as StreamrConfig
        return (await streamrConfig.poolValueDriftLimitFraction()).toBigInt()
    }

    /**
     * Find the sum of unwithdrawn earnings in Sponsorships (that the Operator must withdraw before the sum reaches a limit),
     * SUBJECT TO the constraints, set in the OperatorServiceConfig:
     *  - only take at most maxSponsorshipsCount addresses (those with most earnings), or all if undefined
     *  - only take sponsorships that have more than minSponsorshipEarnings, or all if undefined
     * @param operatorContractAddress
     */
    async getUnwithdrawnEarningsOf(operatorContractAddress: EthereumAddress): Promise<UnwithdrawnEarningsData> {
        const operator = new Contract(operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
        const minSponsorshipEarningsWei = BigNumber.from(this.config.minSponsorshipEarnings ?? 0)
        const { sponsorshipAddresses: allSponsorshipAddresses, earnings } = await operator.getEarningsFromSponsorships()

        const sponsorships = allSponsorshipAddresses
            .map((address, i) => ({ address, earnings: earnings[i] }))
            .filter((sponsorship) => sponsorship.earnings.gte(minSponsorshipEarningsWei))
            .sort((a, b) => Number(b.earnings.sub(a.earnings).toBigInt())) // TODO: after Node 20, use .toSorted() instead
            .slice(0, this.config.maxSponsorshipsCount) // take all if maxSponsorshipsCount is undefined
        const sponsorshipAddresses = sponsorships.map((sponsorship) => sponsorship.address as EthereumAddress)

        const approxPoolValue = (await operator.totalValueInSponsorshipsWei()).toBigInt()
        const sumDataWei = sponsorships.reduce((sum, sponsorship) => sum.add(sponsorship.earnings), BigNumber.from(0)).toBigInt()
        const fraction = sumDataWei * ONE_ETHER / approxPoolValue

        return { sumDataWei, fraction, sponsorshipAddresses }
    }

    async getMyUnwithdrawnEarnings(): Promise<UnwithdrawnEarningsData> {
        return this.getUnwithdrawnEarningsOf(this.config.operatorContractAddress)
    }

    async withdrawEarningsFromSponsorships(sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await (await this.operator.withdrawEarningsFromSponsorships(sponsorshipAddresses)).wait()
    }

    /**  TODO: remove. Logic should be in the service side.
     * Checks if the Operator contract has too much outstanding earnings in Sponsorships.
     * Too much unwithdrawn earnings means if the operator doesn't withdraw, someone else can do it and get rewarded.
     * @dev ethers5 uses BigNumber, but once it's upgrated to ethers6, it will be changed to BigInt (see ETH-536)
     * @param withdrawLimitFraction Fraction of the pool value that triggers the withdraw
     * @param operatorContractAddress default to "my" Operator contract
     */
    async checkAndWithdrawEarningsFromSponsorships(
        withdrawLimitFraction: bigint,
        operatorContractAddress?: EthereumAddress,
    ): Promise<void> {
        const operator = operatorContractAddress
            ? new Contract(operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
            : this.operator
        const minSponsorshipEarningsWei = this.config.minSponsorshipEarnings
            ? BigNumber.from(this.config.minSponsorshipEarnings)
            : BigNumber.from(0)
        const { sponsorshipAddresses, earnings } = await operator.getEarningsFromSponsorships()

        const sponsorships: { address: string, earnings: BigNumber }[] = []
        for (let i = 0; i < sponsorshipAddresses.length; i++) {
            // skip sponsorships with too low earnings
            if (earnings[i] < minSponsorshipEarningsWei) {
                continue
            }
            const sponsorship = {
                address: sponsorshipAddresses[i],
                earnings: earnings[i],
            }
            sponsorships.push(sponsorship)
        }

        // sort sponsorships by earnings in descending order and pick the most valuable ones
        const sortedSponsorships = sponsorships.sort((a: any, b: any) => b.earnings - a.earnings)
        const neededSponsorships = sortedSponsorships.slice(0, this.config.maxSponsorshipsCount)

        let sumEarningsDataWei = BigInt(0)
        for (const sponsorship of neededSponsorships) {
            sumEarningsDataWei += sponsorship.earnings.toBigInt()
        }

        const approxPoolValueBeforeWithdraw = (await operator.totalValueInSponsorshipsWei()).toBigInt()
        const withdrawLimitDataWei = approxPoolValueBeforeWithdraw * withdrawLimitFraction / ONE_ETHER

        logger.info(`Withdraw earnings from ${neededSponsorships.length} sponsorships`, { sumEarningsDataWei, withdrawLimitDataWei })
        if (sumEarningsDataWei > withdrawLimitDataWei) {
            await (await operator.withdrawEarningsFromSponsorships(neededSponsorships.map((sponsorship) => sponsorship.address))).wait()
        }
    }

    private async getOperatorAddresses(requiredBlockNumber: number, queryFilter: string): Promise<EthereumAddress[]> {
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

        const operatorAddresses: EthereumAddress[] = []
        for await (const operator of queryResult) {
            operatorAddresses.push(toEthereumAddress(operator.id))
        }
        return operatorAddresses
    }
}
