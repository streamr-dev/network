import { Request, Response, NextFunction } from 'express'
import { Logger } from 'streamr-network'
import { StreamFetcher } from './StreamFetcher'
import { StreamPermission, Todo } from 'streamr-client'
import { EthereumAddress } from 'streamr-client-protocol'

const logger = new Logger(module)

export interface AuthenticatedRequest<Q> extends Request<Record<string,any>,any,any,Q,Record<string,any>> {
    stream?: Record<string, unknown>
}

/**
 * Middleware used to authenticate REST API requests
 */
export const authenticator = (streamFetcher: StreamFetcher, permission = StreamPermission.SUBSCRIBE,
    user: EthereumAddress) => (req: Todo, res: Response, next: NextFunction): void => {

    // Try to parse authorization header if defined
    if (req.headers.authorization !== undefined) {
        const sessionTokenHeaderValid = req.headers.authorization.toLowerCase().startsWith('bearer ')
        if (!sessionTokenHeaderValid) {
            const errMsg = 'Authorization header malformed. Should be of form "Bearer session-token".'
            logger.debug(errMsg)

            res.status(400).send({
                error: errMsg
            })
            return
        }
    }

    req.stream = streamFetcher.authenticate(req.params.id, user, permission)
    next()
}
