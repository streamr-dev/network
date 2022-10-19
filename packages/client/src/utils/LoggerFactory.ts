import { inject, Lifecycle, scoped } from 'tsyringe'
import { Logger } from '@streamr/utils'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'

@scoped(Lifecycle.ContainerScoped)
export class LoggerFactory {
    constructor(
        @inject(ConfigInjectionToken.Root) private readonly rootConfig: Pick<StrictStreamrClientConfig, 'id' | 'logLevel'>
    ) {}

    createLogger(module: NodeJS.Module): Logger {
        return new Logger(module, this.rootConfig.id, this.rootConfig.logLevel)
    }
}
