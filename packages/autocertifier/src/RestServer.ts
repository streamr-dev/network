/* eslint-disable @typescript-eslint/parameter-properties, class-methods-use-this */

import express from 'express'
import { RestInterface } from './RestInterface'
import { Logger } from '@streamr/utils'
import { Err, FailedToExtractIpAddress, SteamrWebSocketPortMissing, TokenMissing, UnspecifiedError } from './errors'
import bodyParser from 'body-parser'

const logger = new Logger(module)

type ExpressType = ReturnType<typeof express>
type ServerType = ReturnType<ExpressType['listen']>

export class RestServer {

    private server?: ServerType

    constructor(private port: string, private engine: RestInterface) {
    }

    private extractIpAndPort = (req: express.Request): { ip: string, port: string } | undefined => {
        // take x-forwarded for into account
        const remoteIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress
        const remotePort = req.headers['x-forwarded-port'] || req.socket.remotePort
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

        return { ip: '' + ip, port: '' + port }
    }

    public async start(): Promise<void> {
        return new Promise<void>((resolve, _reject) => {

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

            const app = express()

            app.use(bodyParser.json())

            app.get('/robots.txt', (_req, res) => {
                res.type('text/plain')
                res.send('User-agent: *\nDisallow: /')
            })

            // create new subdomain and certificate
            app.patch('/certifiedsubdomains', async (req, res) => {

                if (!req.body || !req.body.streamrWebSocketPort) {
                    const err = new SteamrWebSocketPortMissing('Streamr websocket port not given')
                    sendError(res, err)
                    return
                }
                const streamrWebSocketPort = req.body.streamrWebSocketPort + ''

                const ipAndPort = this.extractIpAndPort(req)
                if (!ipAndPort) {
                    const err = new FailedToExtractIpAddress('Failed to extract IP address from request')
                    sendError(res, err)
                    return
                }

                try {
                    const certifiedSubdomain = await this.engine.createNewSubdomainAndCertificate(
                        ipAndPort.ip, ipAndPort.port, streamrWebSocketPort)

                    sendResponse(res, certifiedSubdomain)
                } catch (err) {
                    sendError(res, err)
                    return
                }
            })

            // get new certificate for existing subdomain

            app.patch('/certifiedsubdomains/:subdomain', async (req, res) => {
                const subdomain = req.params.subdomain

                if (!req.body || !req.body.streamrWebSocketPort) {
                    const err = new SteamrWebSocketPortMissing('Streamr websocket port not given')
                    sendError(res, err)
                    return
                }
                const streamrWebSocketPort = req.body.streamrWebSocketPort + ''

                if (!req.body || !req.body.token) {
                    const err = new TokenMissing('Token not given')
                    sendError(res, err)
                    return
                }
                const token = req.body.token

                const ipAndPort = this.extractIpAndPort(req)
                if (!ipAndPort) {
                    const err = new FailedToExtractIpAddress('Failed to extract IP address from request')
                    sendError(res, err)
                    return
                }
                try {
                    const certifiedSubdomain = await this.engine.createNewCertificateForSubdomain(subdomain,
                        ipAndPort.ip, ipAndPort.port, streamrWebSocketPort, token)

                    sendResponse(res, certifiedSubdomain)
                } catch (err) {
                    sendError(res, err)
                    return
                }
            })

            // update subdomain ip and port

            app.put('/certifiedsubdomains/:subdomain/ip', async (req, res) => {
                const subdomain = req.params.subdomain

                if (!req.body || !req.body.streamrWebSocketPort) {
                    const err = new SteamrWebSocketPortMissing('Streamr websocket port not given')
                    sendError(res, err)
                    return
                }
                const streamrWebSocketPort = req.body.streamrWebSocketPort + ''

                if (!req.body || !req.body.token) {
                    const err = new TokenMissing('Token not given')
                    sendError(res, err)
                    return
                }
                const token = req.body.token

                const ipAndPort = this.extractIpAndPort(req)
                if (!ipAndPort) {
                    const err = new FailedToExtractIpAddress('Failed to extract IP address from request')
                    sendError(res, err)
                    return
                }
                try {
                    await this.engine.updateSubdomainIpAndPort(subdomain, ipAndPort.ip,
                        ipAndPort.port, streamrWebSocketPort, token)

                    sendResponse(res)
                } catch (err) {
                    sendError(res, err)
                }
            })

            this.server = app.listen(this.port, () => {
                logger.info('Rest server is running on port ' + this.port)
                resolve()
            })
        })
    }

    public async stop(): Promise<void> {
        if (this.server) {
            this.server.close()
        }
    }
}
