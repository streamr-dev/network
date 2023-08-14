import { ReadyState, AbstractWsConnection } from '../connection/ws/AbstractWsConnection';
import { PeerInfo } from '../connection/PeerInfo';
import { DisconnectionCode, DisconnectionReason } from '../connection/ws/AbstractWsEndpoint';
import { Logger } from "@streamr/utils";
export declare const staticLogger: Logger;
export declare class ServerWsConnection extends AbstractWsConnection {
    private readyState;
    private ownAddress;
    private ownPeerInfo;
    private remoteAddress;
    constructor(ownAddress: string, ownPeerInfo: PeerInfo, remoteAddress: string, remotePeerInfo: PeerInfo);
    close(code: DisconnectionCode, reason: DisconnectionReason): void;
    terminate(): void;
    getBufferedAmount(): number;
    getReadyState(): ReadyState;
    sendPing(): void;
    send(message: string): Promise<void>;
    getRemoteAddress(): string | undefined;
}
