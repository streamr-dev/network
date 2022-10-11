import { inject, Lifecycle, scoped } from 'tsyringe'
import { Logger } from '@streamr/utils'
import { StreamrClientIdToken } from '../Container'

@scoped(Lifecycle.ContainerScoped)
export class LoggerFactory {
    constructor(@inject(StreamrClientIdToken) private readonly streamrClientId: string) {}

    createLogger(module: NodeJS.Module): Logger {
        return new Logger(module, this.streamrClientId)
    }
}
