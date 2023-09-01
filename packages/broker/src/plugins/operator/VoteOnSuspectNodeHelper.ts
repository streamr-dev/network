import { Contract } from '@ethersproject/contracts'
import type { Operator } from '@streamr/network-contracts'
import { operatorABI } from '@streamr/network-contracts'
import { Logger } from '@streamr/utils'
import { OperatorServiceConfig } from './OperatorPlugin'

export const VOTE_KICK = '0x0000000000000000000000000000000000000000000000000000000000000001'
export const VOTE_NO_KICK = '0x0000000000000000000000000000000000000000000000000000000000000000'

const logger = new Logger(module)

export class VoteOnSuspectNodeHelper {
    private readonly contract: Operator
    private readonly callback: (sponsorship: string, operatorContractAddress: string) => void

    constructor(config: OperatorServiceConfig,
        callback: (sponsorship: string, operatorContractAddress: string) => void) {
        this.callback = callback
        this.contract = new Contract(config.operatorContractAddress, operatorABI, config.signer) as unknown as Operator
    }

    async start(): Promise<void> {
        logger.debug('Starting')
        this.contract.on('ReviewRequest', async (sponsorship: string, targetOperator: string) => {
            logger.debug('Receive review request', { address: this.contract.address, sponsorship, targetOperator })
            this.callback(sponsorship, targetOperator)
        })
    }

    async voteOnFlag(sponsorship: string, targetOperator: string, kick: boolean): Promise<void> {
        const voteData = kick ? VOTE_KICK : VOTE_NO_KICK
        await (await this.contract.voteOnFlag(sponsorship, targetOperator, voteData)).wait()
    }

    stop(): void {
        this.contract.removeAllListeners()
    }
}
