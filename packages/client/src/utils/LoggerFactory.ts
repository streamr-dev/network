import { inject, Lifecycle, scoped } from 'tsyringe'
import { Logger } from '@streamr/utils'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'

@scoped(Lifecycle.ContainerScoped)
export class LoggerFactory {
    constructor(
        @inject(ConfigInjectionToken) private readonly config: Pick<StrictStreamrClientConfig, 'id' | 'logLevel'>
    ) {}

    createLogger(module: NodeJS.Module): Logger {
        return new Logger(module, this.config.id, this.config.logLevel)
    }
}
