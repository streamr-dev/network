import { EventEmitter } from 'eventemitter3'
import { IAutoCertifierRpc } from '../generated/packages/autocertifier-client/protos/AutoCertifier.server'
import { HasSessionRequest, HasSessionResponse } from '../generated/packages/autocertifier-client/protos/AutoCertifier'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { filePathToNodeFormat, Logger } from '@streamr/utils'
import { RestClient } from './RestClient'
import { CertifiedSubdomain } from './data/CertifiedSubdomain'
import fs from 'fs'
import path from 'path'
import * as forge from 'node-forge'

interface AutoCertifierClientEvents {
    updatedCertificate: (domain: CertifiedSubdomain) => void
}

export type HasSession = (request: HasSessionRequest, context: ServerCallContext) => Promise<HasSessionResponse>

const logger = new Logger(module)

const ensureConfigFileWritable = (directory: string): void => {
    const baseDirectory = getBaseDirectory(directory)
    fs.accessSync(baseDirectory, fs.constants.W_OK | fs.constants.R_OK)
    logger.trace(`Directory ${baseDirectory} is readable and writable`)
}

const getBaseDirectory = (directory: string): string => {
    const subDirs = directory.split(path.sep)
    do {
        const current = subDirs.join(path.sep)
        if (fs.existsSync(current)) {
            return current
        }
        subDirs.pop()
    } while (subDirs.length > 0)
    return path.sep
}

export const SERVICE_ID = 'system/auto-certificer'
const ONE_DAY = 1000 * 60 * 60 * 24
const MAX_INT_32 = 2147483647

// TODO: remove code duplication regarding ongoingSessions management
// TODO: add logging and make logging consistent
// TODO: validate CertifiedSubdomain when read from file and when received from server
export class AutoCertifierClient extends EventEmitter<AutoCertifierClientEvents> implements IAutoCertifierRpc {
    private updateTimeout?: NodeJS.Timeout
    private readonly restClient: RestClient
    private readonly configFile: string
    private readonly streamrWebSocketPort: number
    private readonly ongoingSessions: Set<string> = new Set()

    constructor(
        configFile: string,
        streamrWebSocketPort: number,
        restApiUrl: string,
        registerRpcMethod: (serviceId: string, rpcMethodName: string, method: HasSession) => void
    ) {
        super()

        this.restClient = new RestClient(restApiUrl)
        this.configFile = filePathToNodeFormat(configFile)
        this.streamrWebSocketPort = streamrWebSocketPort
        registerRpcMethod(SERVICE_ID, 'hasSession', this.hasSession.bind(this))
    }

    public async start(): Promise<void> {
        if (!fs.existsSync(this.configFile)) {
            await this.createCertificate()
        } else {
            await this.ensureCertificateValidity()
        }
    }

    private async ensureCertificateValidity(): Promise<void> {
        const certificate = this.loadCertificateFromDisk()
        const certObj = forge.pki.certificateFromPem(certificate.certificate)
        const expirationTimestamp = certObj.validity.notAfter.getTime()
        if (Date.now() >= expirationTimestamp - ONE_DAY) {
            await this.updateCertificate()
        } else {
            // TODO: most of the time the ip should not change. Calling this is important for whenever it does.
            // should avoid calling this.updateSubDomainIp in scheduled calls if certificate is not expiring.
            await this.updateSubdomainIp()
            this.scheduleCertificateUpdate(expirationTimestamp)
            this.emit('updatedCertificate', certificate)
        }
    }

    private loadCertificateFromDisk(): CertifiedSubdomain {
        const certificate = JSON.parse(fs.readFileSync(this.configFile, 'utf8')) as CertifiedSubdomain
        return certificate
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
        this.updateTimeout = setTimeout(() => this.ensureCertificateValidity(), updateIn)
    }

    private createCertificate = async (): Promise<void> => {
        const dir = path.dirname(this.configFile)
        ensureConfigFileWritable(dir)

        const sessionId = await this.restClient.createSession()
        let certifiedSubdomain: CertifiedSubdomain

        this.ongoingSessions.add(sessionId)

        try {
            certifiedSubdomain = await this.restClient.createSubdomainAndCertificate(
                this.streamrWebSocketPort,
                sessionId
            )
        } finally {
            this.ongoingSessions.delete(sessionId)
        }
        // TODO: use async fs methods?
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(this.configFile, JSON.stringify(certifiedSubdomain))
        const certObj = forge.pki.certificateFromPem(certifiedSubdomain.certificate)

        const expirationTimestamp = certObj.validity.notAfter.getTime()
        this.scheduleCertificateUpdate(expirationTimestamp)

        this.emit('updatedCertificate', certifiedSubdomain)
    }

    private updateCertificate = async (): Promise<void> => {
        const sessionId = await this.restClient.createSession()
        this.ongoingSessions.add(sessionId)

        const oldCertifiedSubdomain = JSON.parse(fs.readFileSync(this.configFile, 'utf8')) as CertifiedSubdomain
        const updatedCertifiedSubdomain = await this.restClient.updateCertificate(
            oldCertifiedSubdomain.fqdn.split('.')[0],
            this.streamrWebSocketPort,
            sessionId,
            oldCertifiedSubdomain.authenticationToken
        )

        this.ongoingSessions.delete(sessionId)

        // TODO: use async fs methods?
        fs.writeFileSync(this.configFile, JSON.stringify(updatedCertifiedSubdomain))
        const certObj = forge.pki.certificateFromPem(updatedCertifiedSubdomain.certificate)

        const expirationTimestamp = certObj.validity.notAfter.getTime()
        this.scheduleCertificateUpdate(expirationTimestamp)

        // TODO: if the certificate was not updated there's no need to emit the event. Could compare certificates?
        this.emit('updatedCertificate', updatedCertifiedSubdomain)
    }

    // This method should be called whenever the IP address or port of the node changes
    public updateSubdomainIp = async (): Promise<void> => {
        if (!fs.existsSync(this.configFile)) {
            logger.warn('updateSubdomainIp() called while subdomain file does not exist')
            return
        }
        // TODO: use async fs methods?
        const oldSubdomain = JSON.parse(fs.readFileSync(this.configFile, 'utf8')) as CertifiedSubdomain
        logger.info('updateSubdomainIp() called for ' + oldSubdomain.fqdn)
        const sessionId = await this.restClient.createSession()
        this.ongoingSessions.add(sessionId)
        await this.restClient.updateSubdomainIp(
            oldSubdomain.fqdn.split('.')[0],
            this.streamrWebSocketPort,
            sessionId,
            oldSubdomain.authenticationToken
        )
        this.ongoingSessions.delete(sessionId)
    }

    // IAutoCertifierRpc implementation
    // TODO: could move to the DHT package or move all rpc related logic here from AutoCertifierClientFacade in DHT
    async hasSession(request: HasSessionRequest): Promise<HasSessionResponse> {
        logger.info('hasSession() called ' + this.ongoingSessions.size + ' ongoing sessions')
        if (this.ongoingSessions.has(request.sessionId)) {
            return { sessionId: request.sessionId }
        } else {
            throw new Error(`Session not found ${request.sessionId}`)
        }
    }
}
