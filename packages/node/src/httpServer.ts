import fs from 'fs'
import { Server as HttpServer } from 'http'
import https, { Server as HttpsServer } from 'https'
import cors from 'cors'
import express, { Request, Response, NextFunction, RequestHandler } from 'express'
import { Logger } from '@streamr/utils'
import { once } from 'events'
import { StrictConfig } from './config/config'
import { ApiAuthentication, isValidAuthentication } from './apiAuthentication'

const logger = new Logger(module)

const HTTP_STATUS_UNAUTHORIZED = 401
const HTTP_STATUS_FORBIDDEN = 403

export interface Endpoint {
    path: string
    method: 'get' | 'post'
    requestHandlers: RequestHandler[]
    apiAuthentication?: ApiAuthentication
}

const getApiKey = (req: Request) => {
    const headerValue = req.headers.authorization
    const PREFIX = 'bearer '
    if (headerValue?.toLowerCase().startsWith(PREFIX)) {
        return headerValue.substring(PREFIX.length)
    }
    return undefined
}

export const createAuthenticatorMiddleware = (
    apiAuthentication?: ApiAuthentication
): ((req: Request, res: Response, next: NextFunction) => void) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const apiKey = getApiKey(req)
        if (isValidAuthentication(apiKey, apiAuthentication)) {
            next()
        } else {
            const status = apiKey === undefined ? HTTP_STATUS_UNAUTHORIZED : HTTP_STATUS_FORBIDDEN
            res.sendStatus(status)
        }
    }
}

export const startServer = async (
    endpoints: Endpoint[],
    config: StrictConfig['httpServer']
): Promise<HttpServer | https.Server> => {
    const app = express()
    app.use(
        cors({
            origin: true, // Access-Control-Allow-Origin: request origin. The default '*' is invalid if credentials included.
            credentials: true // Access-Control-Allow-Credentials: true
        })
    )
    endpoints.forEach((endpoint: Endpoint) => {
        const handlers = [createAuthenticatorMiddleware(endpoint.apiAuthentication)].concat(endpoint.requestHandlers)
        app.route(endpoint.path)[endpoint.method](handlers)
    })
    let serverFactory: { listen: (port: number) => HttpServer | HttpsServer }
    if (config.sslCertificate !== undefined) {
        serverFactory = https.createServer(
            {
                cert: fs.readFileSync(config.sslCertificate.certFileName),
                key: fs.readFileSync(config.sslCertificate.privateKeyFileName)
            },
            app
        )
    } else {
        serverFactory = app
    }
    const server = serverFactory.listen(config.port)
    await once(server, 'listening')
    logger.info(`Started HTTP server on port ${config.port}`)
    return server
}

export const stopServer = async (httpServer: HttpServer | HttpsServer): Promise<void> => {
    if (httpServer.listening) {
        httpServer.close()
        await once(httpServer, 'close')
    }
}
