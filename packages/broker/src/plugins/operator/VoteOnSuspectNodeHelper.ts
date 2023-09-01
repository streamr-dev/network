import { Contract } from '@ethersproject/contracts'
import { Wallet } from '@ethersproject/wallet'
import type { Operator } from '@streamr/network-contracts'
import { operatorABI } from '@streamr/network-contracts'
import { Logger } from '@streamr/utils'
import { OperatorServiceConfig } from './OperatorPlugin'
import { ensureValidStreamPartitionIndex } from '@streamr/protocol'

export const VOTE_KICK = '0x0000000000000000000000000000000000000000000000000000000000000001'
export const VOTE_NO_KICK = '0x0000000000000000000000000000000000000000000000000000000000000000'

const logger = new Logger(module)

export class ParseError extends Error {
    public readonly reasonText: string

    constructor(reasonText: string) {
        super(`failed to parse metadata: ${reasonText}`)
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

export class VoteOnSuspectNodeHelper {
    private readonly nodeWallet: Wallet
    private readonly contract: Operator
    private readonly callback: (sponsorship: string, operatorContractAddress: string, partition: number) => void

    constructor(config: OperatorServiceConfig,
        callback: (sponsorship: string, operatorContractAddress: string) => void) {
        this.callback = callback
        this.nodeWallet = config.nodeWallet
        this.contract = new Contract(config.operatorContractAddress, operatorABI, this.nodeWallet) as unknown as Operator
    }

    async start(): Promise<void> {
        logger.debug('Starting')
        this.contract.on('ReviewRequest', (sponsorship: string, targetOperator: string, metadataAsString?: string) => {
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
            this.callback(sponsorship, targetOperator, partition)
        })
    }

    async voteOnFlag(sponsorship: string, targetOperator: string, kick: boolean): Promise<void> {
        const voteData = kick ? VOTE_KICK : VOTE_NO_KICK
        await (await this.contract.voteOnFlag(sponsorship, targetOperator, voteData)).wait()
    }

    stop(): void {
        // TODO: remove only the listener added by this class
        this.nodeWallet.provider.removeAllListeners()
    }
}
