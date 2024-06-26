import { StreamID, ensureValidStreamPartitionIndex, toStreamID } from '@streamr/protocol'
import { NetworkPeerDescriptor } from '@streamr/sdk'
import {
    EthereumAddress,
    Logger,
    ObservableEventEmitter,
    TheGraphClient,
    collect,
    toEthereumAddress
} from '@streamr/utils'
import { Overrides } from 'ethers'
import sample from 'lodash/sample'
import { Authentication } from '../Authentication'
import { DestroySignal } from '../DestroySignal'
import { RpcProviderSource } from '../RpcProviderSource'
import type { Operator as OperatorContract } from '../ethereumArtifacts/Operator'
import OperatorArtifact from '../ethereumArtifacts/OperatorAbi.json'
import type { Sponsorship as SponsorshipContract } from '../ethereumArtifacts/Sponsorship'
import SponsorshipArtifact from '../ethereumArtifacts/SponsorshipAbi.json'
import { LoggerFactory } from '../utils/LoggerFactory'
import { ChainEventPoller } from './ChainEventPoller'
import { ContractFactory } from './ContractFactory'
import { ObservableContract, initContractEventGateway } from './contract'
import { z } from 'zod'

interface RawResult {
    operator: null | { latestHeartbeatTimestamp: string | null }
}

interface EarningsData {
    sponsorshipAddresses: EthereumAddress[]
    sumDataWei: bigint
    maxAllowedEarningsDataWei: bigint
}

/**
 * @deprecated
 * @hidden
 */
export interface StakeEvent {  // TODO export, do we want to keep the current style where event payloads are always objects?
    sponsorship: EthereumAddress
}

/**
 * @deprecated
 * @hidden
 */
export interface ReviewRequestEvent {
    sponsorship: EthereumAddress
    targetOperator: EthereumAddress
    partition: number
    votingPeriodStartTimestamp: number
    votingPeriodEndTimestamp: number
}

/**
 * @deprecated
 * @hidden
 */
export interface OperatorEvents {
    staked: (payload: StakeEvent) => void
    unstaked: (payload: StakeEvent) => void
    reviewRequested: (payload: ReviewRequestEvent) => void
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

const compareBigInts = (a: bigint, b: bigint) => {
    if (a < b) {
        return -1
    } else if (a > b) {
        return 1
    } else {
        return 0
    }
}

const logger = new Logger(module)

/**
 * @deprecated
 * @hidden
 */
export interface SponsorshipResult {
    sponsorshipAddress: EthereumAddress
    streamId: StreamID
    operatorCount: number
}

/**
 * @deprecated
 * @hidden
 */
export interface Flag {
    id: string
    flaggingTimestamp: number
    target: {
        id: string
    }
    sponsorship: {
        id: string
    }
}

/**
 * @deprecated This in an internal class
 * @hidden
 */
export class Operator {

    private readonly contractAddress: EthereumAddress
    private contract?: ObservableContract<OperatorContract>
    private readonly contractReadonly: ObservableContract<OperatorContract>
    private readonly contractFactory: ContractFactory
    private readonly rpcProviderSource: RpcProviderSource
    private readonly theGraphClient: TheGraphClient
    private readonly authentication: Authentication
    private readonly getEthersOverrides: () => Promise<Overrides>
    private readonly eventEmitter: ObservableEventEmitter<OperatorEvents> = new ObservableEventEmitter()

    constructor(
        contractAddress: EthereumAddress,
        contractFactory: ContractFactory,
        rpcProviderSource: RpcProviderSource,
        theGraphClient: TheGraphClient,
        authentication: Authentication,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory,
        getEthersOverrides: () => Promise<Overrides>,
        eventPollInterval: number
    ) {
        this.contractAddress = contractAddress
        this.contractFactory = contractFactory
        this.rpcProviderSource = rpcProviderSource
        this.contractReadonly = contractFactory.createReadContract<OperatorContract>(
            toEthereumAddress(contractAddress),
            OperatorArtifact,
            rpcProviderSource.getProvider(),
            'operator'
        )
        this.theGraphClient = theGraphClient
        this.authentication = authentication
        this.getEthersOverrides = getEthersOverrides
        this.initEventGateways(contractAddress, loggerFactory, eventPollInterval)
        destroySignal.onDestroy.listen(() => {
            this.eventEmitter.removeAllListeners()
        })
    }

    private initEventGateways(
        contractAddress: EthereumAddress,
        loggerFactory: LoggerFactory,
        eventPollInterval: number
    ): void {
        const chainEventPoller = new ChainEventPoller(this.rpcProviderSource.getSubProviders().map((p) => {
            return this.contractFactory.createEventContract(contractAddress, OperatorArtifact, p)
        // eslint-disable-next-line no-underscore-dangle
        }), eventPollInterval)
        const stakeEventTransformation = (sponsorship: string) => ({
            sponsorship: toEthereumAddress(sponsorship)
        })
        // TODO change initContractEventGateway so that it doesn't requite target to be StreamrClientEventEmitter
        // -> then "as any" casting is not needed
        initContractEventGateway({
            sourceName: 'Staked',
            sourceEmitter: chainEventPoller,
            targetName: 'staked' as any,
            targetEmitter: this.eventEmitter as any,
            transformation: stakeEventTransformation,
            loggerFactory
        })
        initContractEventGateway({
            sourceName: 'Unstaked',
            sourceEmitter: chainEventPoller,
            targetName: 'unstaked' as any,
            targetEmitter: this.eventEmitter as any,
            transformation: stakeEventTransformation,
            loggerFactory
        })
        const reviewRequestTransform = (
            sponsorship: string,
            targetOperator: string,
            voteStartTimestampInSecs: number,
            voteEndTimestampInSecs: number,
            metadataAsString?: string
        ) => {
            const partition = parsePartitionFromReviewRequestMetadata(metadataAsString)
            return {
                sponsorship: toEthereumAddress(sponsorship),
                targetOperator: toEthereumAddress(targetOperator),
                partition,
                votingPeriodStartTimestamp: voteStartTimestampInSecs * 1000,
                votingPeriodEndTimestamp: voteEndTimestampInSecs * 1000
            }
        }
        initContractEventGateway({
            sourceName: 'ReviewRequest',
            sourceEmitter: chainEventPoller,
            targetName: 'reviewRequested' as any,
            targetEmitter: this.eventEmitter as any,
            transformation: reviewRequestTransform,
            loggerFactory
        })
    }

    async writeHeartbeat(nodeDescriptor: NetworkPeerDescriptor): Promise<void> {
        const metadata = JSON.stringify(nodeDescriptor)
        await this.connectToContract()
        await (await this.contract!.heartbeat(metadata, await this.getEthersOverrides())).wait()
    }

    async getTimestampOfLastHeartbeat(): Promise<number | undefined> {
        const result = await this.theGraphClient.queryEntity<RawResult>({
            query: `{
                operator(id: "${await this.getOperatorContractAddress()}") {
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

    async getOperatorContractAddress(): Promise<EthereumAddress> {
        return toEthereumAddress(await this.contractReadonly.getAddress())
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

    async getExpiredFlags(sponsorships: EthereumAddress[], maxAgeInMs: number): Promise<Flag[]> {
        const maxFlagStartTime = Math.floor((Date.now() - maxAgeInMs) / 1000)
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                {
                    flags (where : {
                        id_gt: "${lastId}",
                        flaggingTimestamp_lt: ${maxFlagStartTime},
                        result_in: ["waiting", "voting"],
                        sponsorship_in: ${JSON.stringify(sponsorships)}
                    }, first: ${pageSize}) {
                        id
                        flaggingTimestamp
                        target {
                            id
                        }
                        sponsorship {
                            id
                        }
                    }
                }`
            }
        }
        const flagEntities = this.theGraphClient.queryEntities<Flag>(createQuery)
        const flags: Flag[] = []
        for await (const flag of flagEntities) {
            flags.push(flag)
        }
        return flags
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
        await this.connectToContract()
        await (await this.contract!.flag(sponsorship, operator, metadata, await this.getEthersOverrides())).wait()
    }

    async getRandomOperator(): Promise<EthereumAddress | undefined> {
        const latestBlock = await this.getCurrentBlockNumber()  // TODO maybe we should remove this "feature"?
        const operators = await this.getOperatorAddresses(latestBlock)
        const excluded = await this.getOperatorContractAddress()
        const operatorAddresses = operators.filter((id) => id !== excluded)
        logger.debug(`Found ${operatorAddresses.length} operators`)
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
        const operator = this.contractFactory.createReadContract<OperatorContract>(
            toEthereumAddress(operatorContractAddress),
            OperatorArtifact,
            this.rpcProviderSource.getProvider(),
            'operator'
        )
        const minSponsorshipEarningsInWithdrawWei = BigInt(minSponsorshipEarningsInWithdraw ?? 0)
        const {
            addresses: allSponsorshipAddresses,
            earnings,
            maxAllowedEarnings,
        } = await operator.getSponsorshipsAndEarnings() as {  // TODO why casting is needed?
            addresses: string[]
            earnings: bigint[]
            maxAllowedEarnings: bigint
        }

        const sponsorships = allSponsorshipAddresses
            .map((address, i) => ({ address, earnings: earnings[i] }))
            .filter((sponsorship) => sponsorship.earnings >= minSponsorshipEarningsInWithdrawWei)
            .sort((a, b) => compareBigInts(a.earnings, b.earnings)) // TODO: after Node 20, use .toSorted() instead
            .slice(0, maxSponsorshipsInWithdraw) // take all if maxSponsorshipsInWithdraw is undefined

        return {
            sponsorshipAddresses: sponsorships.map((sponsorship) => toEthereumAddress(sponsorship.address)),
            sumDataWei: sponsorships.reduce((sum, sponsorship) => sum += sponsorship.earnings, 0n),
            maxAllowedEarningsDataWei: maxAllowedEarnings
        }
    }

    async getMyEarnings(
        minSponsorshipEarningsInWithdraw: number,
        maxSponsorshipsInWithdraw: number
    ): Promise<EarningsData> {
        return this.getEarningsOf(
            await this.getOperatorContractAddress(),
            minSponsorshipEarningsInWithdraw,
            maxSponsorshipsInWithdraw
        )
    }

    async withdrawMyEarningsFromSponsorships(sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await this.connectToContract()
        await (await this.contract!.withdrawEarningsFromSponsorships(
            sponsorshipAddresses,
            await this.getEthersOverrides()
        )).wait()
    }

    async triggerWithdraw(targetOperatorAddress: EthereumAddress, sponsorshipAddresses: EthereumAddress[]): Promise<void> {
        await this.connectToContract()
        await (await this.contract!.triggerAnotherOperatorWithdraw(
            targetOperatorAddress,
            sponsorshipAddresses,
            await this.getEthersOverrides()
        )).wait()
    }

    private async getOperatorAddresses(requiredBlockNumber: number): Promise<EthereumAddress[]> {
        // TODO: find a clever more efficient way of selecting a random operator? (NET-1113)
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        operators(where: {totalStakeInSponsorshipsWei_gt: "0", id_gt: "${lastId}"}, first: ${pageSize}) {
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

    async* pullStakedStreams(
        requiredBlockNumber: number
    ): AsyncGenerator<{ sponsorship: { id: string, stream: { id: string } } }, undefined, undefined> {
        const contractAddress = await this.getOperatorContractAddress()
        const createQuery = (lastId: string, pageSize: number) => {
            return {
                query: `
                    {
                        operator(id: "${contractAddress}") {
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
                logger.error('Unable to find operator in The Graph', { operatorContractAddress: contractAddress })
                return []
            }
            return response.operator.stakes
        }
        this.theGraphClient.updateRequiredBlockNumber(requiredBlockNumber)
        yield* this.theGraphClient.queryEntities<{ id: string, sponsorship: { id: string, stream: { id: string } } }>(createQuery, parseItems)
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

    async getStreamId(sponsorshipAddress: string): Promise<StreamID> {
        const sponsorship = this.contractFactory.createReadContract<SponsorshipContract>(
            toEthereumAddress(sponsorshipAddress),
            SponsorshipArtifact,
            this.rpcProviderSource.getProvider(),
            'sponsorship'
        )
        return toStreamID(await sponsorship.streamId())
    }

    async voteOnFlag(sponsorship: string, targetOperator: string, kick: boolean): Promise<void> {
        const voteData = kick ? VOTE_KICK : VOTE_NO_KICK
        await this.connectToContract()
        // typical gas cost 99336, but this has shown insufficient sometimes
        // TODO should we set gasLimit only here, or also for other transactions made by ContractFacade?
        await (await this.contract!.voteOnFlag(
            sponsorship,
            targetOperator,
            voteData,
            { ...this.getEthersOverrides(), gasLimit: '1300000' }
        )).wait()
    }

    async closeFlag(sponsorship: string, targetOperator: string): Promise<void> {
        // voteOnFlag is not used to vote here but to close the expired flag. The vote data gets ignored.
        // Anyone can call this function at this point.
        await this.voteOnFlag(sponsorship, targetOperator, false)
    }

    async fetchRedundancyFactor(): Promise<number | undefined> {
        const MetadataSchema = z.object({
            redundancyFactor: z.number()
                .int()
                .gte(1)
        })
        const metadataAsString = await this.contractReadonly.metadata()
        if (metadataAsString.length === 0) {
            return 1
        }
        let metadata: Record<string, unknown>
        try {
            metadata = JSON.parse(metadataAsString)
        } catch {
            logger.warn('Encountered malformed metadata', { operatorAddress: await this.getOperatorContractAddress(), metadataAsString })
            return undefined
        }
        let validatedMetadata: z.infer<typeof MetadataSchema>
        try {
            validatedMetadata = MetadataSchema.parse(metadata)
        } catch (err) {
            logger.warn('Encountered invalid metadata', {
                operatorAddress: await this.getOperatorContractAddress(),
                metadataAsString,
                reason: err?.reason
            })
            return undefined
        }
        return validatedMetadata.redundancyFactor
    }

    getCurrentBlockNumber(): Promise<number> {
        return this.rpcProviderSource.getProvider().getBlockNumber()
    }

    on<E extends keyof OperatorEvents>(eventName: E, listener: OperatorEvents[E]): void {
        this.eventEmitter.on(eventName, listener as any)  // TODO why casting?
    }

    off<E extends keyof OperatorEvents>(eventName: E, listener: OperatorEvents[E]): void {
        this.eventEmitter.off(eventName, listener as any)  // TODO why casting?
    }

    private async connectToContract(): Promise<void> {
        if (this.contract === undefined) {
            const signer = await this.authentication.getTransactionSigner(this.rpcProviderSource)
            this.contract = this.contractFactory.createWriteContract<OperatorContract>(
                this.contractAddress,
                OperatorArtifact,
                signer,
                'operator'
            )
        }
    }
}
