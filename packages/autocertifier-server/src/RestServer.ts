import express from 'express'
import { RestInterface } from './RestInterface'
import { Logger, filePathToNodeFormat } from '@streamr/utils'
import {
    Err,
    FailedToExtractIpAddress,
    SteamrWebSocketPortMissing,
    TokenMissing,
    UnspecifiedError,
    CreateCertifiedSubdomainRequest,
    UpdateIpAndPortRequest
} from '@streamr/autocertifier-client'
import bodyParser from 'body-parser'
import * as https from 'https'
import * as fs from 'fs'

const logger = new Logger(module)

type ExpressType = ReturnType<typeof express>
type ServerType = ReturnType<ExpressType['listen']>

const sendError = (res: express.Response, err: any) => {
    if (err instanceof Err) {
        logger.error('Error ' + JSON.stringify(err))
        res.status(err.httpStatus).send(err.toApiError())
    } else {
        logger.error('Unspecified error ' + JSON.stringify(err))
        const unspecifiedError = new UnspecifiedError('Unspecified error')
        res.status(unspecifiedError.httpStatus).send(unspecifiedError.toApiError())
    }
}

const sendResponse = (res: express.Response, data?: object) => {
    if (!data) {
        res.json({})
    } else {
        res.json(data)
    }
}

const parseIpAndPort = (req: express.Request): { ip: string; port: string } | undefined => {
    // take x-forwarded for into account
    const remoteIp = req.headers['x-forwarded-for'] ?? req.socket.remoteAddress
    const remotePort = req.headers['x-forwarded-port'] ?? req.socket.remotePort
    let ip = remoteIp
    let port = remotePort
    if (typeof remoteIp !== 'string' && typeof remoteIp !== 'number') {
        if (Array.isArray(remoteIp) && remoteIp.length > 0) {
            ip = remoteIp[0]
        } else {
            logger.error('invalid remote ip: ' + remoteIp)
            return undefined
        }
    }
    if (typeof remotePort !== 'string' && typeof remotePort !== 'number') {
        if (Array.isArray(remotePort) && remotePort.length > 0) {
            port = remotePort[0]
        } else {
            logger.error('invalid remote port: ' + remotePort)
            return undefined
        }
    }
    logger.info('extracted ip: ' + ip + ' port: ' + port + ' from request')
    return { ip: '' + ip, port: '' + port }
}

export class RestServer {
    private server?: ServerType
    private engine: RestInterface

    private ownIpAddress: string
    private port: number
    private certPath: string
    private keyPath: string

    constructor(ownIpAddress: string, port: number, certPath: string, keyPath: string, engine: RestInterface) {
        this.ownIpAddress = ownIpAddress
        this.port = port
        this.certPath = filePathToNodeFormat(certPath)
        this.keyPath = filePathToNodeFormat(keyPath)
        this.engine = engine
    }

    public async start(): Promise<void> {
        return new Promise<void>((resolve, _reject) => {
            const app = express()
            app.use(bodyParser.json())

            app.get('/robots.txt', (_req, res) => {
                res.type('text/plain')
                res.send('User-agent: *\nDisallow: /')
            })

            // create new session
            app.post('/sessions', this.createSession)

            // create new subdomain and certificate
            app.patch('/certificates', async (req, res) => {
                await this.createSubdomainAndCertificate(req, res)
            })

            // get new certificate for existing subdomain
            app.patch('/certificates/:subdomain', this.createNewCertificateForExistingSubdomain)

            // update subdomain ip and port
            app.put('/certificates/:subdomain/ip', this.updateSubdomainIp)

            const options = {
                key: fs.readFileSync(this.keyPath),
                cert: fs.readFileSync(this.certPath)
            }

            this.server = https.createServer(options, app)

            this.server.listen(this.port, this.ownIpAddress, () => {
                logger.info('Rest server is running on port ' + this.port)
                resolve()
            })
        })
    }

    // TODO: perhaps this can be moved out of class? At the moment it is required by RestInterface
    private createSession = async (_req: express.Request, res: express.Response): Promise<void> => {
        try {
            const session = await this.engine.createSession()
            sendResponse(res, session)
        } catch (err) {
            sendError(res, err)
        }
    }

    private createSubdomainAndCertificate = async (req: express.Request, res: express.Response): Promise<void> => {
        logger.info('createSubdomainAndCertificate')
        const body = req.body as CreateCertifiedSubdomainRequest
        if (!body?.streamrWebSocketPort) {
            const err = new SteamrWebSocketPortMissing('Streamr websocket port not given')
            sendError(res, err)
            return
        }
        const streamrWebSocketPort = body.streamrWebSocketPort + ''
        const ipAndPort = parseIpAndPort(req)
        if (!ipAndPort) {
            const err = new FailedToExtractIpAddress('Failed to extract IP address from request')
            sendError(res, err)
            return
        }
        const sessionId = body.sessionId
        try {
            const certifiedSubdomain = await this.engine.createNewSubdomainAndCertificate(
                ipAndPort.ip,
                ipAndPort.port,
                streamrWebSocketPort,
                sessionId
            )
            sendResponse(res, certifiedSubdomain)
        } catch (err) {
            sendError(res, err)
        }
    }

    private createNewCertificateForExistingSubdomain = async (
        req: express.Request,
        res: express.Response
    ): Promise<void> => {
        const subdomain = req.params.subdomain
        const body = req.body as UpdateIpAndPortRequest

        if (!body?.streamrWebSocketPort) {
            const err = new SteamrWebSocketPortMissing('Streamr websocket port not given')
            sendError(res, err)
            return
        }
        const streamrWebSocketPort = body.streamrWebSocketPort + ''
        if (!body?.token) {
            const err = new TokenMissing('Token not given')
            sendError(res, err)
            return
        }
        const token = body.token
        const sessionId = body.sessionId
        const ipAndPort = parseIpAndPort(req)
        if (!ipAndPort) {
            const err = new FailedToExtractIpAddress('Failed to extract IP address from request')
            sendError(res, err)
            return
        }
        try {
            const certifiedSubdomain = await this.engine.createNewCertificateForSubdomain(
                subdomain,
                ipAndPort.ip,
                ipAndPort.port,
                streamrWebSocketPort,
                sessionId,
                token
            )

            sendResponse(res, certifiedSubdomain)
        } catch (err) {
            sendError(res, err)
        }
    }

    private updateSubdomainIp = async (req: express.Request, res: express.Response): Promise<void> => {
        const subdomain = req.params.subdomain
        const body = req.body as UpdateIpAndPortRequest

        if (!body?.streamrWebSocketPort) {
            const err = new SteamrWebSocketPortMissing('Streamr websocket port not given')
            sendError(res, err)
            return
        }
        const streamrWebSocketPort = req.body.streamrWebSocketPort + ''

        if (!body?.token) {
            const err = new TokenMissing('Token not given')
            sendError(res, err)
            return
        }
        const token = body.token
        const sessionId = body.sessionId

        const ipAndPort = parseIpAndPort(req)
        if (!ipAndPort) {
            const err = new FailedToExtractIpAddress('Failed to extract IP address from request')
            sendError(res, err)
            return
        }
        logger.debug(
            'updateSubdomainIp() ' +
                'subdomain: ' +
                subdomain +
                ', ip: ' +
                ipAndPort.ip +
                ', port: ' +
                ipAndPort.port +
                ', streamrWebSocketPort: ' +
                streamrWebSocketPort +
                ', sessionId: ' +
                ' ' +
                sessionId +
                ', token: ' +
                token
        )
        try {
            await this.engine.updateSubdomainIp(
                subdomain,
                ipAndPort.ip,
                ipAndPort.port,
                streamrWebSocketPort,
                sessionId,
                token
            )

            sendResponse(res)
        } catch (err) {
            sendError(res, err)
        }
    }

    public async stop(): Promise<void> {
        this.server!.close()
    }
}
