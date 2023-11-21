import { Provider } from '@ethersproject/providers'
import { Operator, Sponsorship, operatorABI, sponsorshipABI } from '@streamr/network-contracts'
import { StreamID, ensureValidStreamPartitionIndex, toStreamID } from '@streamr/protocol'
import {
    EthereumAddress,
    Logger,
    TheGraphClient,
    addManagedEventListener,
    toEthereumAddress,
    collect
} from '@streamr/utils'
import { Contract } from 'ethers'
import sample from 'lodash/sample'
import fetch from 'node-fetch'
import { NetworkPeerDescriptor } from 'streamr-client'
import { OperatorServiceConfig } from './OperatorPlugin'

interface RawResult {
    operator: null | { latestHeartbeatTimestamp: string | null }
}

interface EarningsData {
    sponsorshipAddresses: EthereumAddress[]
    sumDataWei: bigint
    maxAllowedEarningsDataWei: bigint
}

export const VOTE_KICK = '0x0000000000000000000000000000000000000000000000000000000000000001'
export const VOTE_NO_KICK = '0x0000000000000000000000000000000000000000000000000000000000000000'

export class ParseError extends Error {
    public readonly reasonText: string

    constructor(reasonText: string) {
        super(`Failed to parse metadata: ${reasonText}`)
        this.reasonText = reasonText
    }
}

export function parsePartitionFromReviewRequestMetadata(metadataAsString: string | undefined): number | never {
    if (metadataAsString === undefined) {
        throw new ParseError('no metadata')
    }

    let metadata: Record<string, unknown>
    try {
        metadata = JSON.parse(metadataAsString)
    } catch {
        throw new ParseError('malformed metadata')
    }

    const partition = Number(metadata.partition)
    if (isNaN(partition)) {
        throw new ParseError('invalid or missing "partition" field')
    }

    try {
        ensureValidStreamPartitionIndex(partition)
    } catch {
        throw new ParseError('invalid partition numbering')
    }

    return partition
}

export type ReviewRequestListener = (
    sponsorship: EthereumAddress,
    operatorContractAddress: EthereumAddress,
    partition: number,
    votingPeriodStartTime: number,
    votingPeriodEndTime: number
) => void

const logger = new Logger(module)

export interface SponsorshipResult {
    sponsorshipAddress: EthereumAddress
    streamId: StreamID
    operatorCount: number
}

export class ContractFacade {

    private readonly operatorContract: Operator
    private readonly theGraphClient: TheGraphClient
    private readonly config: OperatorServiceConfig

    // for tests
    constructor(operatorContract: Operator, theGraphClient: TheGraphClient, config: OperatorServiceConfig) {
        this.operatorContract = operatorContract
        this.theGraphClient = theGraphClient
        this.config = config
    }

    static createInstance(config: OperatorServiceConfig): ContractFacade {
        return new ContractFacade(
            new Contract(config.operatorContractAddress, operatorABI, config.signer) as unknown as Operator,
            new TheGraphClient({
                serverUrl: config.theGraphUrl,
                fetch,
                logger
            }),
            config
        )
    }

    async writeHeartbeat(nodeDescriptor: NetworkPeerDescriptor): Promise<void> {
        const metadata = JSON.stringify(nodeDescriptor)
        await (await this.operatorContract.heartbeat(metadata)).wait()
    }

    async getTimestampOfLastHeartbeat(): Promise<number | undefined> {
        const result = await this.theGraphClient.queryEntity<RawResult>({
            query: `{
                operator(id: "${this.getOperatorContractAddress()}") {
                    latestHeartbeatTimestamp
                }
            }`
        })
        if (result.operator === null || result.operator.latestHeartbeatTimestamp === null) {
            return undefined
        } else {
            const timestampInSecs = parseInt(result.operator.latestHeartbeatTimestamp)
            if (isNaN(timestampInSecs)) {
                throw new Error('Assertion failed: unexpected non-integer latestHeartbeatTimestamp') // should never happen
            }
            return timestampInSecs * 1000
        }
    }

    getOperatorContractAddress(): EthereumAddress {
        return toEthereumAddress(this.operatorContract.address)
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

    async getRandomOperator(): Promise<EthereumAddress | undefined> {
        const latestBlock = await this.operatorContract.provider.getBlockNumber()
        const operators = await this.getOperatorAddresses(latestBlock)
        const excluded = this.getOperatorContractAddress()
        const operatorAddresses = operators.filter((id) => id !== excluded)
        logger.debug(`Found ${operatorAddresses.length} operators`, { operatorAddresses })
        return sample(operatorAddresses)
    }

    /**
     * Find the sum of earnings in Sponsorships (that the Operator must withdraw before the sum reaches a limit),
     * SUBJECT TO the constraints, set in the OperatorServiceConfig:
     *  - only take at most maxSponsorshipsInWithdraw addresses (those with most earnings), or all if undefined
     *  - only take sponsorships that have more than minSponsorshipEarningsInWithdraw, or all if undefined
     */
    async getEarningsOf(
        operatorContractAddress: EthereumAddress,
        minSponsorshipEarningsInWithdraw: number,
        maxSponsorshipsInWithdraw: number
    ): Promise<EarningsData> {
        const operator = new Contract(operatorContractAddress, operatorABI, this.config.signer) as unknown as Operator
        const minSponsorshipEarningsInWithdrawWei = BigInt(minSponsorshipEarningsInWithdraw ?? 0)
        const {
            addresses: allSponsorshipAddresses,
            earnings,
            maxAllowedEarnings,
        } = await operator.getSponsorshipsAndEarnings()

        const sponsorships = allSponsorshipAddresses
            .map((address, i) => ({ address, earnings: earnings[i].toBigInt() }))
            .filter((sponsorship) => sponsorship.earnings >= minSponsorshipEarningsInWithdrawWei)
            .sort((a, b) => Number(b.earnings - a.earnings)) // TODO: after Node 20, use .toSorted() instead
            .slice(0, maxSponsorshipsInWithdraw) // take all if maxSponsorshipsInWithdraw is undefined

        return {
            sponsorshipAddresses: sponsorships.map((sponsorship) => toEthereumAddress(sponsorship.address)),
            sumDataWei: sponsorships.reduce((sum, sponsorship) => sum += sponsorship.earnings, 0n),
            maxAllowedEarningsDataWei: maxAllowedEarnings.toBigInt()
        }
    }

    async getMyEarnings(
        minSponsorshipEarningsInWithdraw: number,
        maxSponsorshipsInWithdraw: number
    ): Promise<EarningsData> {
        return this.getEarningsOf(
            this.getOperatorContractAddress(),
            minSponsorshipEarningsInWithdraw,
            maxSponsorshipsInWithdraw
        )
    }

    async withdrawMyEarningsFromSponsorships(sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await (await this.operatorContract.withdrawEarningsFromSponsorships(sponsorshipAddresses)).wait()
    }

    async triggerWithdraw(targetOperatorAddress: EthereumAddress, sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await (await this.operatorContract.triggerAnotherOperatorWithdraw(targetOperatorAddress, sponsorshipAddresses)).wait()
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

    pullStakedStreams(requiredBlockNumber: number): AsyncGenerator<{ sponsorship: { id: string, stream: { id: string } } }> {
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        operator(id: "${this.getOperatorContractAddress()}") {
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
                logger.error('Unable to find operator in The Graph', { operatorContractAddress: this.operatorContract.address })
                return []
            }
            return response.operator.stakes
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        return this.theGraphClient.queryEntities<{ id: string, sponsorship: { id: string, stream: { id: string } } }>(createQuery, parseItems)
    }

    async hasOpenFlag(operatorAddress: EthereumAddress, sponsorshipAddress: EthereumAddress): Promise<boolean> {
        const createQuery = () => {
            return {
                query: `
                    {
                        flags(where: {
                            sponsorship: "${sponsorshipAddress}",
                            target: "${operatorAddress}",
                            result_in: ["waiting", "voting"]
                        }) {
                            id
                        }
                    }
                    `
            }
        }
        const queryResult = this.theGraphClient.queryEntities<{ id: string }>(createQuery)

        const flags = await collect(queryResult, 1)
        if (flags.length > 0) {
            logger.debug('Found open flag', { flag: flags[0] })
            return true
        } else {
            return false
        }
    }

    addReviewRequestListener(listener: ReviewRequestListener, abortSignal: AbortSignal): void {
        addManagedEventListener<any, any>(
            this.operatorContract as any,
            'ReviewRequest',
            (
                sponsorship: string,
                targetOperator: string,
                voteStartTimestampInSecs: number,
                voteEndTimestampInSecs: number,
                metadataAsString?: string
            ) => {
                let partition: number
                try {
                    partition = parsePartitionFromReviewRequestMetadata(metadataAsString)
                } catch (err) {
                    if (err instanceof ParseError) {
                        logger.warn(`Skip review request (${err.reasonText})`, {
                            address: this.operatorContract.address,
                            sponsorship,
                            targetOperator,
                        })
                    } else {
                        logger.warn('Encountered unexpected error', { err })
                    }
                    return
                }
                logger.debug('Receive review request', {
                    address: this.operatorContract.address,
                    sponsorship,
                    targetOperator,
                    partition
                })
                listener(
                    toEthereumAddress(sponsorship),
                    toEthereumAddress(targetOperator),
                    partition,
                    voteStartTimestampInSecs * 1000,
                    voteEndTimestampInSecs * 1000
                )
            },
            abortSignal
        )
    }

    async getStreamId(sponsorshipAddress: string): Promise<StreamID> {
        const sponsorship = new Contract(sponsorshipAddress, sponsorshipABI, this.config.signer) as unknown as Sponsorship
        return toStreamID(await sponsorship.streamId())
    }

    async voteOnFlag(sponsorship: string, targetOperator: string, kick: boolean): Promise<void> {
        const voteData = kick ? VOTE_KICK : VOTE_NO_KICK
        await (await this.operatorContract.voteOnFlag(sponsorship, targetOperator, voteData)).wait()
    }

    addOperatorContractStakeEventListener(eventName: 'Staked' | 'Unstaked', listener: (sponsorship: string) => unknown): void {
        this.operatorContract.on(eventName, listener)
    }

    removeOperatorContractStakeEventListener(eventName: 'Staked' | 'Unstaked', listener: (sponsorship: string) => unknown): void {
        this.operatorContract.off(eventName, listener)
    }

    getProvider(): Provider {
        return this.config.signer.provider!
    }
}
