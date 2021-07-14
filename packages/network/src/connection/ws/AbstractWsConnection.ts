import { PeerInfo } from '../PeerInfo'
import {
    DisconnectionCode,
    DisconnectionReason,
} from './AbstractWsEndpoint'
import { Logger } from '../../helpers/Logger'

export const HIGH_BACK_PRESSURE = 1024 * 1024 * 2
export const LOW_BACK_PRESSURE = 1024 * 1024

export type ReadyState = 0 | 1 | 2 | 3

export abstract class AbstractWsConnection {
    private readonly peerInfo: PeerInfo
    private readonly logger: Logger
    private respondedPong = true
    private rtt?: number
    private rttStart?: number
    private highBackPressure = false
    private onLowBackPressure?: () => void
    private onHighBackPressure?: () => void

    protected constructor(peerInfo: PeerInfo) {
        this.peerInfo = peerInfo
        this.logger = new Logger(module, peerInfo.peerId)

    }

    setBackPressureHandlers(onLowBackPressure: () => void, onHighBackPressure: () => void): void | never {
        if (this.onLowBackPressure === undefined && this.onHighBackPressure === undefined) {
            this.onLowBackPressure = onLowBackPressure
            this.onHighBackPressure = onHighBackPressure
        } else {
            throw new Error('invariant: cannot re-set backpressure handlers')
        }
    }

    ping(): void {
        this.respondedPong = false
        this.rttStart = Date.now()
        this.sendPing()
    }

    onPong(): void {
        this.respondedPong = true
        this.rtt = Date.now() - this.rttStart!
    }

    evaluateBackPressure(): void {
        const bufferedAmount = this.getBufferedAmount()
        if (!this.highBackPressure && bufferedAmount > HIGH_BACK_PRESSURE) {
            this.logger.trace('Back pressure HIGH for %s at %d', this.getPeerInfo(), bufferedAmount)
            this.highBackPressure = true
            if (this.onHighBackPressure === undefined) {
                throw new Error('onHighBackPressure listener not set')
            }
            this.onHighBackPressure()
        } else if (this.highBackPressure && bufferedAmount < LOW_BACK_PRESSURE) {
            this.logger.trace('Back pressure LOW for %s at %d', this.getPeerInfo(), bufferedAmount)
            this.highBackPressure = false
            if (this.onLowBackPressure === undefined) {
                throw new Error('onLowBackPressure listener not set')
            }
            this.onLowBackPressure()
        }
    }

    getPeerInfo(): PeerInfo {
        return this.peerInfo
    }

    getRespondedPong(): boolean {
        return this.respondedPong
    }

    getRtt(): number | undefined {
        return this.rtt
    }

    getPeerId(): string {
        return this.getPeerInfo().peerId
    }

    abstract sendPing(): void
    abstract getBufferedAmount(): number
    abstract send(message: string): Promise<void>
    abstract terminate(): void
    abstract getReadyState(): ReadyState
    abstract close(code: DisconnectionCode, reason: DisconnectionReason): void
}