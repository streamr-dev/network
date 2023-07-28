import { EthereumAddress, Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorValueHelper } from './MaintainOperatorValueHelper'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 // 1 hour

export class OperatorValueBreachWatcher {
    private penaltyLimitFraction = BigInt(0)
    private readonly helper: MaintainOperatorValueHelper
    private readonly abortController: AbortController

    constructor(config: OperatorServiceConfig) {
        this.helper = new MaintainOperatorValueHelper(config)
        this.abortController = new AbortController()
    }

    async checkRandomUnwithdrawnEarnings(): Promise<void> {
        const randomOperatorAddress = await this.helper.getRandomOperator()
        return this.checkUnwithdrawnEarningsOf(randomOperatorAddress)
    }

    async checkUnwithdrawnEarningsOf(operatorAddress: EthereumAddress): Promise<void> {
        logger.info('Check unwithdrawn earnings and check if they are above the safe threshold')
        const { fraction, sponsorshipAddresses } = await this.helper.getUnwithdrawnEarningsOf(operatorAddress)
        logger.info(` -> is ${fraction} > ${this.penaltyLimitFraction}?`)
        if (fraction > this.penaltyLimitFraction) {
            logger.info("Withdrawing earnings from sponsorships", { sponsorshipAddresses })
            await this.helper.withdrawEarningsFromSponsorships(sponsorshipAddresses)
        }
    }

    // TODO: remove operator contract address param from start() AND:
    //      deploy new env (using streamrEnvDeployer) with 2 operator contracts
    //      if should pick the other one, not itself
    //      test against the "other" one
    //      develop agains the fast chain
    async start(): Promise<void> {
        this.penaltyLimitFraction = await this.helper.getPenaltyLimitFraction()

        await scheduleAtInterval(
            () => this.checkRandomUnwithdrawnEarnings().catch((err) => {
                logger.warn('Encountered error while watching operators', { err })
            }),
            CHECK_VALUE_INTERVAL,
            true,
            this.abortController.signal
        )
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
