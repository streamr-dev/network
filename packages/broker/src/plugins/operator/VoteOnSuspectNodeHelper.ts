import { Contract } from '@ethersproject/contracts'
import type { Operator } from '@streamr/network-contracts'
import { operatorABI, Sponsorship, sponsorshipABI } from '@streamr/network-contracts'
import { addManagedEventListener, EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { OperatorServiceConfig } from './OperatorPlugin'
import { ensureValidStreamPartitionIndex, StreamID, toStreamID } from '@streamr/protocol'
import { Signer } from 'ethers'

export const VOTE_KICK = '0x0000000000000000000000000000000000000000000000000000000000000001'
export const VOTE_NO_KICK = '0x0000000000000000000000000000000000000000000000000000000000000000'

const logger = new Logger(module)

export class ParseError extends Error {
    public readonly reasonText: string

    constructor(reasonText: string) {
        super(`Failed to parse metadata: ${reasonText}`)
        this.reasonText = reasonText
    }
}

export function parsePartitionFromMetadata(metadataAsString: string | undefined): number | never {
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
    partition: number
) => void

export class VoteOnSuspectNodeHelper {
    private readonly signer: Signer
    private readonly contract: Operator

    constructor(
        config: OperatorServiceConfig,
        contract = new Contract(config.operatorContractAddress, operatorABI, config.signer) as unknown as Operator,
    ) {
        this.signer = config.signer
        this.contract = contract
    }

    addReviewRequestListener(listener: ReviewRequestListener, abortSignal: AbortSignal): void {
        addManagedEventListener<any, any>(
            this.contract as any,
            'ReviewRequest',
            (sponsorship: string, targetOperator: string, metadataAsString?: string) => {
                let partition: number
                try {
                    partition = parsePartitionFromMetadata(metadataAsString)
                } catch (err) {
                    if (err instanceof ParseError) {
                        logger.warn(`Skip review request (${err.reasonText})`, {
                            address: this.contract.address,
                            sponsorship,
                            targetOperator,
                        })
                    } else {
                        logger.warn('Encountered unexpected error', { err })
                    }
                    return
                }
                logger.debug('Receive review request', {
                    address: this.contract.address,
                    sponsorship,
                    targetOperator,
                    partition
                })
                listener(toEthereumAddress(sponsorship), toEthereumAddress(targetOperator), partition)
            },
            abortSignal
        )
    }

    async getStreamId(sponsorshipAddress: string): Promise<StreamID> {
        const sponsorship = new Contract(sponsorshipAddress, sponsorshipABI, this.signer) as unknown as Sponsorship
        return toStreamID(await sponsorship.streamId())
    }

    async voteOnFlag(sponsorship: string, targetOperator: string, kick: boolean): Promise<void> {
        const voteData = kick ? VOTE_KICK : VOTE_NO_KICK
        await (await this.contract.voteOnFlag(sponsorship, targetOperator, voteData)).wait()
    }
}
