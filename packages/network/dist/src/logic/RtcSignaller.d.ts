import { NodeToTracker } from '../protocol/NodeToTracker';
import { PeerId, PeerInfo } from '../connection/PeerInfo';
import { Originator } from '@streamr/protocol';
import { NodeId } from '../identifiers';
export interface OfferOptions {
    routerId: string;
    originatorInfo: Originator;
    connectionId: string;
    description: string;
}
export interface AnswerOptions {
    routerId: string;
    originatorInfo: Originator;
    connectionId: string;
    description: string;
}
export interface IceCandidateOptions {
    routerId: string;
    originatorInfo: Originator;
    connectionId: string;
    candidate: string;
    mid: string;
}
export interface ConnectOptions {
    routerId: string;
    targetNode: NodeId;
    originatorInfo: Originator;
}
export interface ErrorOptions {
    routerId: string;
    targetNode: NodeId;
    errorCode: string;
}
export declare class RtcSignaller {
    private readonly peerInfo;
    private readonly nodeToTracker;
    private offerListener;
    private answerListener;
    private iceCandidateListener;
    private connectListener;
    private errorListener;
    constructor(peerInfo: PeerInfo, nodeToTracker: NodeToTracker);
    sendRtcOffer(routerId: string, targetPeerId: PeerId, connectionId: string, description: string): void;
    sendRtcAnswer(routerId: string, targetPeerId: PeerId, connectionId: string, description: string): void;
    sendRtcIceCandidate(routerId: string, targetPeerId: PeerId, connectionId: string, candidate: string, mid: string): void;
    sendRtcConnect(routerId: string, targetPeerId: PeerId): void;
    setOfferListener(fn: (opts: OfferOptions) => void): void;
    setAnswerListener(fn: (opts: AnswerOptions) => void): void;
    setIceCandidateListener(fn: (opts: IceCandidateOptions) => void): void;
    setErrorListener(fn: (opts: ErrorOptions) => void): void;
    setConnectListener(fn: (opts: ConnectOptions) => void): void;
}
