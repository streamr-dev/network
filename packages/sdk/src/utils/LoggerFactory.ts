import { Logger, type LoggerModule } from '@streamr/utils'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, type StrictStreamrClientConfig } from '../ConfigTypes'

@scoped(Lifecycle.ContainerScoped)
export class LoggerFactory {

    private readonly config: Pick<StrictStreamrClientConfig, 'id' | 'logLevel'>

    constructor(
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'id' | 'logLevel'>
    ) {
        this.config = config
    }

    createLogger(loggerModule: LoggerModule): Logger {
        return new Logger(loggerModule, { id: this.config.id }, this.config.logLevel)
    }
}
