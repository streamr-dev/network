import { inject, Lifecycle, scoped } from 'tsyringe'
import { Logger } from '@streamr/utils'
import { StreamrClientIdToken } from '../Container'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'

@scoped(Lifecycle.ContainerScoped)
export class LoggerFactory {
    constructor(
        @inject(StreamrClientIdToken) private readonly streamrClientId: string,
        @inject(ConfigInjectionToken.Root) private readonly rootConfig: StrictStreamrClientConfig
    ) {}

    createLogger(module: NodeJS.Module): Logger {
        return new Logger(module, this.streamrClientId, this.rootConfig.logLevel)
    }
}
