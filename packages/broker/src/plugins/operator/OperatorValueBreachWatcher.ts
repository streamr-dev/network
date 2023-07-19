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

    async start(operatorId?: EthereumAddress): Promise<void> {
        this.penaltyLimitFraction = await this.helper.getPenaltyLimitFraction()

        await scheduleAtInterval(
            () => this.watchOperators(operatorId).catch((err) => {
                logger.warn('Encountered error while watching operators', { err })
            }),
            CHECK_VALUE_INTERVAL,
            true,
            this.abortController.signal
        )
    }

    private async watchOperators(myOperatorId?: EthereumAddress): Promise<void> {
        const operatorId = myOperatorId
            ? myOperatorId
            : await this.helper.getRandomOperator()
        logger.info('Wathcing if other operator earnings are above the allowed amount to get rewarded', { operatorId: operatorId })
        await this.helper.checkAndWithdrawEarningsFromSponsorships(this.penaltyLimitFraction, operatorId)
    }

    async stop(): Promise<void> {
        logger.info('Stop')
        this.abortController.abort()
    }
}
