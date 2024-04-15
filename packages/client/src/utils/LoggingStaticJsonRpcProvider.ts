import { StaticJsonRpcProvider } from '@ethersproject/providers'
import { Logger, randomString } from '@streamr/utils'

const logger = new Logger(module)

export class LoggingStaticJsonRpcProvider extends StaticJsonRpcProvider {

    override async send(method: string, params: any[]): Promise<any> {
        const traceId = randomString(5)
        const startTime = Date.now()
        const logContext = {
            traceId,
            method,
            params,
            connection: {
                url: this.connection.url,
                timeout: this.connection.timeout
            }
        }
        logger.debug('Send request', logContext)
        let result
        try {
            result = await super.send(method, params)
        } catch (err) {
            logger.debug('Encountered error while requesting', {
                ...logContext,
                err,
                elapsedTime: Date.now() - startTime
            })
            throw err
        }
        logger.debug('Received response', {
            ...logContext,
            elapsedTime: Date.now() - startTime
        })
        return result
    }
}
