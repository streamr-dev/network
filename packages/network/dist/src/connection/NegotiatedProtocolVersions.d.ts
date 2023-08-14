import { PeerId, PeerInfo } from "./PeerInfo";
interface NegotiatedProtocolVersion {
    controlLayerVersion: number;
    messageLayerVersion: number;
}
export declare class NegotiatedProtocolVersions {
    private readonly peerInfo;
    private readonly negotiatedProtocolVersions;
    private readonly defaultProtocolVersions;
    constructor(peerInfo: PeerInfo);
    negotiateProtocolVersion(peerId: PeerId, controlLayerVersions: number[], messageLayerVersions: number[]): void | never;
    removeNegotiatedProtocolVersion(peerId: PeerId): void;
    getNegotiatedProtocolVersions(peerId: PeerId): NegotiatedProtocolVersion | undefined;
    getDefaultProtocolVersions(): NegotiatedProtocolVersion;
    private validateProtocolVersions;
}
export {};
