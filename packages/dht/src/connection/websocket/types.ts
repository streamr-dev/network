import type { EventEmitter } from 'eventemitter3'
import type { PortRange, TlsCertificate } from '../ConnectionManager'
import type { IConnection } from '../IConnection'

export interface WebsocketServerEvents {
    connected: ((connection: IConnection) => void) 
}

export interface WebsocketServerOptions {
    portRange: PortRange
    enableTls: boolean
    tlsCertificate?: TlsCertificate
    maxMessageSize?: number
}

export interface IWebsocketServer extends EventEmitter<WebsocketServerEvents> {
    start(): Promise<number>
    stop(): Promise<void>
    updateCertificate(cert: string, key: string): void
}
