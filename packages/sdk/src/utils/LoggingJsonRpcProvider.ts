import { JsonRpcApiProviderOptions, JsonRpcProvider, Networkish, FetchRequest } from 'ethers'
import { Logger, randomString } from '@streamr/utils'

const logger = new Logger('LoggingJsonRpcProvider')

export class LoggingJsonRpcProvider extends JsonRpcProvider {
    private readonly urlConfig: FetchRequest

    constructor(urlConfig: FetchRequest, network?: Networkish, options?: JsonRpcApiProviderOptions) {
        super(urlConfig, network, options)
        this.urlConfig = urlConfig
    }

    override async send(method: string, params: any[]): Promise<any> {
        const traceId = randomString(5)
        const startTime = Date.now()
        const logContext = {
            traceId,
            method,
            params,
            connection: {
                url: this.urlConfig.url,
                timeout: this.urlConfig.timeout
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
