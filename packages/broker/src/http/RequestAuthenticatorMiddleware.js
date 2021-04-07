const HttpError = require('../errors/HttpError')
const logger = require('../helpers/logger')('streamr:http:RequestAuthenticatorMiddleware')

/**
 * Middleware used to authenticate REST API requests
 */
module.exports = (streamFetcher, permission = 'stream_subscribe') => (req, res, next) => {
    let authKey
    let sessionToken

    // Try to parse authorization header if defined
    if (req.headers.authorization !== undefined) {
        const apiKeyHeaderValid = req.headers.authorization.toLowerCase().startsWith('token ')
        const sessionTokenHeaderValid = req.headers.authorization.startsWith('Bearer ')
        if (!(apiKeyHeaderValid || sessionTokenHeaderValid)) {
            const errMsg = 'Authorization header malformed. Should be of form "[Bearer|token] authKey".'
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg
            })
            return
        }
        if (apiKeyHeaderValid) {
            authKey = req.headers.authorization
                .substring(6)
                .trim()
        } else {
            sessionToken = req.headers.authorization
                .substring(7)
                .trim()
        }
    }

    streamFetcher.authenticate(req.params.id, authKey, sessionToken, permission)
        .then((streamJson) => {
            req.stream = streamJson
            next()
        })
        .catch((err) => {
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
