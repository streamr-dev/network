/* eslint-disable class-methods-use-this */
import { EventEmitter } from 'eventemitter3'
import type {
    IWebsocketServer,
    WebsocketServerEvents,
} from '../connection/websocket/types'

/**
 * A stub WebsocketServer for browser environment.
 */

export class WebsocketServer extends EventEmitter<WebsocketServerEvents> implements IWebsocketServer {
    constructor(_params: unknown) {
        super()
    }

    public async start(): Promise<number> {
        return 0
    }

    public async stop(): Promise<void> {
        // do nothing
    }

    public updateCertificate(_cert: string, _key: string): void {
        // do nothing
    }
}

