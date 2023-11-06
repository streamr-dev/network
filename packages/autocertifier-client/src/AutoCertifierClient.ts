import { EventEmitter } from 'eventemitter3'
import { IAutoCertifierRpc } from './proto/packages/autocertifier-client/protos/AutoCertifier.server'
import { SessionIdRequest, SessionIdResponse } from './proto/packages/autocertifier-client/protos/AutoCertifier'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { filePathToNodeFormat } from '@streamr/utils'
import { RestClient } from './RestClient'
import { CertifiedSubdomain } from './data/CertifiedSubdomain'
import fs from 'fs'
import path from 'path'
import * as forge from 'node-forge'
import { Logger } from '@streamr/utils'

interface AutoCertifierClientEvents {
    updatedSubdomain: (domain: CertifiedSubdomain) => void
}

export type GetSessionId = (request: SessionIdRequest, context: ServerCallContext) => Promise<SessionIdResponse>

const logger = new Logger(module)

export const AUTOCERTIFIER_SERVICE_ID = 'system/auto-certificer'
const ONE_DAY = 1000 * 60 * 60 * 24
const MAX_INT_32 = 2147483647

export class AutoCertifierClient extends EventEmitter<AutoCertifierClientEvents> implements IAutoCertifierRpc {

    private updateTimeout?: NodeJS.Timeout
    private readonly restClient: RestClient
    private readonly subdomainFilePath: string
    private readonly streamrWebSocketPort: number
    private readonly ongoingSessions: Set<string> = new Set()

    constructor(
        subdomainFilePath: string,
        streamrWebSocketPort: number,
        restApiUrl: string,
        registerRpcMethod: (
            serviceId: string,
            rpcMethodName: string,
            method: GetSessionId
        ) => void
    ) {
        super()

        this.restClient = new RestClient(restApiUrl)
        this.subdomainFilePath = filePathToNodeFormat(subdomainFilePath)
        this.streamrWebSocketPort = streamrWebSocketPort
        registerRpcMethod(AUTOCERTIFIER_SERVICE_ID, 'getSessionId', this.getSessionId.bind(this))
    }

    public async start(): Promise<void> {
        if (!fs.existsSync(this.subdomainFilePath)) {
            await this.createCertificate()
        } else {
            await this.checkSubdomainValidity()
        }
    }

    private async checkSubdomainValidity(): Promise<void> {
        const sub = this.loadSubdomainFromDisk()

        if (Date.now() >= sub.expirationTimestamp - ONE_DAY) {
            await this.updateCertificate()
        } else {
            await this.updateSubdomainIpAndPort()
            this.scheduleCertificateUpdate(sub.expirationTimestamp)
            this.emit('updatedSubdomain', sub.subdomain)
        }
    }

    private loadSubdomainFromDisk(): { subdomain: CertifiedSubdomain, expirationTimestamp: number } {
        const subdomain = JSON.parse(fs.readFileSync(this.subdomainFilePath, 'utf8')) as CertifiedSubdomain
        const certObj = forge.pki.certificateFromPem(subdomain.certificate.cert)
        const expirationTimestamp = certObj.validity.notAfter.getTime()
        return { subdomain, expirationTimestamp }
    }

    public stop(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout)
            this.updateTimeout = undefined
        }
    }

    private scheduleCertificateUpdate(expirationTimestamp: number): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout)
            this.updateTimeout = undefined
        }
        // update certificate 1 day before it expires
        let updateIn = expirationTimestamp - Date.now()
        if (updateIn > ONE_DAY) {
            updateIn = updateIn - ONE_DAY
        }
        // TODO: This sets the timeout to the maximum value of a 32-bit integer due to the limitation setTimeout has.
        // The original expirationTimestamp should be kept somewhere so that the certificate is not updated every 24 days.
        if (updateIn > MAX_INT_32) {
            updateIn = MAX_INT_32
        }

        logger.info(updateIn + ' milliseconds until certificate update')
        // TODO: use tooling from @streamr/utils to set the timeout with an abortController.
        this.updateTimeout = setTimeout(this.checkSubdomainValidity, updateIn)
    }

    private createCertificate = async (): Promise<void> => {
        const sessionId = await this.restClient.createSession()
        let certifiedSubdomain: CertifiedSubdomain

        this.ongoingSessions.add(sessionId)

        try {
            certifiedSubdomain = await this.restClient.createNewSubdomainAndCertificate(this.streamrWebSocketPort, sessionId)
        } finally {
            this.ongoingSessions.delete(sessionId)
        }
        const dir = path.dirname(this.subdomainFilePath)
        // TODO: use async fs methods?
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(this.subdomainFilePath, JSON.stringify(certifiedSubdomain))
        const certObj = forge.pki.certificateFromPem(certifiedSubdomain.certificate.cert)

        const expirationTimestamp = certObj.validity.notAfter.getTime()
        this.scheduleCertificateUpdate(expirationTimestamp)

        this.emit('updatedSubdomain', certifiedSubdomain)
    }

    private updateCertificate = async (): Promise<void> => {
        const sessionId = await this.restClient.createSession()
        this.ongoingSessions.add(sessionId)

        const oldSubdomain = JSON.parse(fs.readFileSync(this.subdomainFilePath, 'utf8')) as CertifiedSubdomain
        const certifiedSubdomain = await this.restClient.updateCertificate(oldSubdomain.subdomain,
            this.streamrWebSocketPort, oldSubdomain.token, sessionId)

        this.ongoingSessions.delete(sessionId)

        // TODO: use async fs methods?
        fs.writeFileSync(this.subdomainFilePath, JSON.stringify(certifiedSubdomain))
        const certObj = forge.pki.certificateFromPem(certifiedSubdomain.certificate.cert)

        const expirationTimestamp = certObj.validity.notAfter.getTime()
        this.scheduleCertificateUpdate(expirationTimestamp)

        this.emit('updatedSubdomain', certifiedSubdomain)
    }

    // This method should be called whenever the IP address or port of the node changes
    public updateSubdomainIpAndPort = async (): Promise<void> => {
        if (!fs.existsSync(this.subdomainFilePath)) {
            logger.warn('updateSubdomainIpAndPort() called while subdomain file does not exist')
            return
        }
        // TODO: use async fs methods?
        const oldSubdomain = JSON.parse(fs.readFileSync(this.subdomainFilePath, 'utf8')) as CertifiedSubdomain
        logger.info('updateSubdomainIpAndPort() called for ' + JSON.stringify(oldSubdomain))
        const sessionId = await this.restClient.createSession()
        this.ongoingSessions.add(sessionId)
        await this.restClient.updateSubdomainIpAndPort(oldSubdomain.subdomain, this.streamrWebSocketPort, sessionId, oldSubdomain.token)
        this.ongoingSessions.delete(sessionId)
    }

    // IAutoCertifierRpc implementation
    public async getSessionId(request: SessionIdRequest, _context: ServerCallContext): Promise<SessionIdResponse> {
        logger.info('getSessionId() called ' + this.ongoingSessions.size + ' ongoing sessions')
        if (this.ongoingSessions.has(request.sessionId)) {
            return { sessionId: request.sessionId }
        } else {
            return { error: 'client has no such ongoing session' }
        }
    }
}
