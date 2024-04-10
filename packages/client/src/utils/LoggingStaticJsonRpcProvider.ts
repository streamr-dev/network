import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Logger, randomString } from '@streamr/utils'

export class LoggingStaticJsonRpcProvider extends StaticJsonRpcProvider {
    private readonly logger = new Logger(module)

    override async send(method: string, params: any[]): Promise<any> {
        const traceId = randomString(5)
        const startTime = Date.now()
        const logContext = {
            traceId,
            method,
            params,
            connection: this.connection
        }
        this.logger.debug('Send request', logContext)
        let result
        try {
            result = await super.send(method, params)
        } catch (err) {
            this.logger.debug('Encountered error while requesting', {
                ...logContext,
                err,
                elapsedTime: Date.now() - startTime
            })
            throw err
        }
        this.logger.debug('Received response', {
            ...logContext,
            elapsedTime: Date.now() - startTime
        })
        return result
    }
}
