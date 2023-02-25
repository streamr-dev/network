import fs from 'fs'
import { Server as HttpServer } from 'http'
import https, { Server as HttpsServer } from 'https'
import cors from 'cors'
import express, { Request, Response, RequestHandler } from 'express'
import { Logger } from '@streamr/utils'
import { once } from 'events'
import { StrictConfig } from './config/config'
import { ApiAuthenticator } from './apiAuthenticator'

const logger = new Logger(module)

const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_FORBIDDEN = 403

export interface Endpoint {
    path: string
    method: 'get' | 'post'
    requestHandlers: RequestHandler[]
}

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

export const startServer = async (
    routes: Endpoint[],
    config: StrictConfig['httpServer'],
    apiAuthenticator: ApiAuthenticator
): Promise<HttpServer | https.Server> => {
    const app = express()
    app.use(cors({
        origin: true, // Access-Control-Allow-Origin: request origin. The default '*' is invalid if credentials included.
        credentials: true // Access-Control-Allow-Credentials: true
    }))
    app.use(createAuthenticatorMiddleware(apiAuthenticator))
    routes.forEach((route: Endpoint) => {
        app.route(route.path)[route.method](route.requestHandlers)
    })
    let serverFactory: { listen: (port: number) => HttpServer | HttpsServer }
    if (config.sslCertificate !== undefined) {
        serverFactory = https.createServer({
            cert: fs.readFileSync(config.sslCertificate.certFileName),
            key: fs.readFileSync(config.sslCertificate.privateKeyFileName)
        }, app)
    } else {
        serverFactory = app
    }
    const server = serverFactory.listen(config.port)
    await once(server, 'listening')
    logger.info(`HTTP server listening on ${config.port}`)
    return server
}

export const stopServer = async (httpServer: HttpServer | HttpsServer): Promise<void> => {
    if (httpServer.listening) {
        httpServer.close()
        await once(httpServer, 'close')
    }
}
