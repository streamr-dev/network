import { Logger, scheduleAtInterval } from '@streamr/utils'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'
import { OperatorServiceConfig } from './OperatorPlugin'
import { checkOperatorPoolValueBreach } from './checkOperatorPoolValueBreach'

const logger = new Logger(module)

const CHECK_VALUE_INTERVAL = 1000 * 60 * 60 // 1 hour

export class OperatorPoolValueBreachWatcher {
    private driftLimitFractionCached?: bigint
    private readonly abortController: AbortController
    
    // public access modifier for tests 
    readonly helper: MaintainOperatorPoolValueHelper

    constructor(config: OperatorServiceConfig) {
        this.helper = new MaintainOperatorPoolValueHelper(config)
        this.abortController = new AbortController()
    }

    async start(): Promise<void> {
        await scheduleAtInterval(
            async () => checkOperatorPoolValueBreach(
                await this.getDriftLimitFraction(),
                this.helper
            ).catch((err) => {
                logger.warn('Encountered error', { err })
            }),
            CHECK_VALUE_INTERVAL,
            true,
            this.abortController.signal
        )
    }

    private async getDriftLimitFraction(): Promise<bigint> {
        if (this.driftLimitFractionCached === undefined) {
            this.driftLimitFractionCached = await this.helper.getDriftLimitFraction()
        }
        return this.driftLimitFractionCached
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }
}
