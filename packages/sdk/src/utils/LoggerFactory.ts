import { Logger } from '@streamr/utils'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'

@scoped(Lifecycle.ContainerScoped)
export class LoggerFactory {
    private readonly config: Pick<StrictStreamrClientConfig, 'id' | 'logLevel'>

    constructor(@inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'id' | 'logLevel'>) {
        this.config = config
    }

    createLogger(module: NodeJS.Module): Logger {
        return new Logger(module, { id: this.config.id }, this.config.logLevel)
    }
}
