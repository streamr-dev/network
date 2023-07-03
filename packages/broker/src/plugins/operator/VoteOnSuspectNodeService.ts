import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export class VoteOnSuspectNodeService {
    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {
        logger.info('started')
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
        logger.info('stopped')
    }
}
