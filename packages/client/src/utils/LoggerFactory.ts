import { Lifecycle, scoped } from 'tsyringe'
import { instanceId } from './utils'
import { Logger } from '@streamr/utils'

@scoped(Lifecycle.ContainerScoped)
export class LoggerFactory {
    private readonly id = instanceId(this)

    createLogger(module: NodeJS.Module): Logger {
        return new Logger(module, this.id)
    }
}
