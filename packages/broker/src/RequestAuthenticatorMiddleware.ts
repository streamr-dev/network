import { Request, Response, NextFunction } from 'express'
import { HttpError } from './errors/HttpError'
import { Logger } from 'streamr-network'
import { StreamFetcher } from './StreamFetcher'
import { EthereumAddress, StreamOperation } from 'streamr-client'

const logger = new Logger(module)

export interface AuthenticatedRequest<Q> extends Request<Record<string,any>,any,any,Q,Record<string,any>> {
    stream?: Record<string, unknown>
}

/**
 * Middleware used to authenticate REST API requests
 */
export const authenticator = (streamFetcher: StreamFetcher, permission = StreamOperation.STREAM_SUBSCRIBE,
    user: EthereumAddress) => (req: Todo, res: Todo, next: Todo) => {

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

    req.stream = streamFetcher.authenticate(req.params.id, permission, user)
    next()
    // streamFetcher.authenticate(req.params.id, permission, user)
    //     .then((streamJson: Todo) => {
    //         req.stream = streamJson
    //         next()
    //     })
    //     .catch((err: Todo) => {
    //         let errorMsg
    //         if (err instanceof HttpError && err.code === 403) {
    //             errorMsg = 'Authentication failed.'
    //         } else if (err instanceof HttpError && err.code === 404) {
    //             errorMsg = `Stream ${req.params.id} not found.`
    //         } else {
    //             errorMsg = 'Request failed.'
    //         }

    //         logger.error(err)
    //         logger.error(errorMsg)

    //         res.status(err.code || 503).send({
    //             error: errorMsg,
    //         })
    //     })
}
