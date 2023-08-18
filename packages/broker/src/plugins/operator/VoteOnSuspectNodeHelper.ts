import { Contract } from '@ethersproject/contracts'
import { Wallet } from '@ethersproject/wallet'
import type { Operator } from '@streamr/network-contracts'
import { operatorABI } from '@streamr/network-contracts'
import { Logger } from '@streamr/utils'
import { OperatorServiceConfig } from './OperatorPlugin'

export const VOTE_KICK = '0x0000000000000000000000000000000000000000000000000000000000000001'
export const VOTE_NO_KICK = '0x0000000000000000000000000000000000000000000000000000000000000000'

const logger = new Logger(module)

export class VoteOnSuspectNodeHelper {
    private readonly nodeWallet: Wallet
    private readonly contract: Operator

    constructor(config: OperatorServiceConfig) {
        this.nodeWallet = config.nodeWallet
        this.contract = new Contract(config.operatorContractAddress, operatorABI, this.nodeWallet) as unknown as Operator
    }

    async start(reviewRequestCallback: (sponsorship: string, targetOperator: string) => void): Promise<void> {
        logger.debug('Starting')
        this.contract.on('ReviewRequest', async (sponsorship: string, targetOperator: string) => {
            logger.debug('Receive review request', { address: this.contract.address, sponsorship, targetOperator })
            reviewRequestCallback(sponsorship, targetOperator)
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
