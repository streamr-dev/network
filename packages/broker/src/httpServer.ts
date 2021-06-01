import fs from 'fs'
import { Server as HttpServer } from 'http'
import https, { Server as HttpsServer } from 'https'
import cors from 'cors'
import express, { Request, Response } from 'express'
import { Logger } from 'streamr-network'
import { once } from 'events'
import { HttpServerConfig } from './config'
import { ApiAuthenticator } from './apiAuthenticator'

const logger = new Logger(module)

const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_FORBIDDEN = 403

const getApiKey = (req: Request) => {
    const headerValue = req.headers.authorization
    const PREFIX = 'bearer '
    if (headerValue?.toLowerCase().startsWith(PREFIX)) {
        return headerValue.substring(PREFIX.length)
    }
    return undefined
}

const createAuthenticatorMiddleware = (apiAuthenticator: ApiAuthenticator) => {
    return (req: Request, res: Response, next: () => void) => {
        const apiKey = getApiKey(req)
        if (apiAuthenticator.isValidAuthentication(apiKey)) {
            next()
        } else {
            const status = (apiKey === undefined) ? HTTP_STATUS_UNAUTHORIZED : HTTP_STATUS_FORBIDDEN
            res.sendStatus(status)
        }
    }
}

export const startServer = async (routers: express.Router[], config: HttpServerConfig, apiAuthenticator: ApiAuthenticator) => {
    const app = express()
    app.use(cors())
    app.use(createAuthenticatorMiddleware(apiAuthenticator))
    routers.forEach((router) => app.use('/api/v1', router))
    let serverFactory: { listen: (port: number) => HttpServer|HttpsServer }
    if (config.privateKeyFileName && config.certFileName) {
        serverFactory = https.createServer({
            cert: fs.readFileSync(config.certFileName),
            key: fs.readFileSync(config.privateKeyFileName)
        }, app)
    } else {
        serverFactory = app
    }
    const server = serverFactory.listen(config.port)
    await once(server, 'listening')
    logger.info(`HTTP server listening on ${config.port}`)
    return server
}

export const stopServer = async (httpServer: HttpServer|HttpsServer) => {
    httpServer.close()
    await once(httpServer, 'close')
}
