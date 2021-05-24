import { Todo } from './types'
import { HttpError } from './errors/HttpError'
import { Logger } from 'streamr-network'
import { StreamFetcher } from './StreamFetcher'

const logger = new Logger(module)

/**
 * Middleware used to authenticate REST API requests
 */
export const authenticator = (streamFetcher: StreamFetcher, permission = 'stream_subscribe') => (req: Todo, res: Todo, next: Todo) => {
    let sessionToken

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
        sessionToken = req.headers.authorization
            .substring(7)
            .trim()
    }

    streamFetcher.authenticate(req.params.id, sessionToken, permission)
        .then((streamJson: Todo) => {
            req.stream = streamJson
            next()
        })
        .catch((err: Todo) => {
            let errorMsg
            if (err instanceof HttpError && err.code === 403) {
                errorMsg = 'Authentication failed.'
            } else if (err instanceof HttpError && err.code === 404) {
                errorMsg = `Stream ${req.params.id} not found.`
            } else {
                errorMsg = 'Request failed.'
            }

            logger.error(err)
            logger.error(errorMsg)

            res.status(err.code || 503).send({
                error: errorMsg,
            })
        })
}
