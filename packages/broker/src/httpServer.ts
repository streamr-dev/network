import fs from 'fs'
import { Server as HttpServer } from 'http'
import https, { Server as HttpsServer } from 'https'
import cors from 'cors'
import express from 'express'
import { Logger } from 'streamr-network'
import { once } from 'events'
import { HttpServerConfig } from './config'

const logger = new Logger(module)

export const startServer = async (routers: express.Router[], config: HttpServerConfig) => {
    const app = express()
    app.use(cors())
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
