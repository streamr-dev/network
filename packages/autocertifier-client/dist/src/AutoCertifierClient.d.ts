import { EventEmitter } from 'eventemitter3';
import { IAutoCertifierService } from './proto/packages/autocertifier/protos/AutoCertifier.server';
import { SessionIdRequest, SessionIdResponse } from './proto/packages/autocertifier/protos/AutoCertifier';
import { ServerCallContext } from '@protobuf-ts/runtime-rpc';
import { CertifiedSubdomain } from './data/CertifiedSubdomain';
interface AutoCertifierClientEvents {
    updatedSubdomain: (domain: CertifiedSubdomain) => void;
}
export declare class AutoCertifierClient extends EventEmitter<AutoCertifierClientEvents> implements IAutoCertifierService {
    private readonly SERVICE_ID;
    private readonly ONE_DAY;
    private MAX_INT_32;
    private updateTimeout?;
    private readonly restClient;
    private readonly subdomainPath;
    private readonly streamrWebSocketPort;
    private readonly ongoingSessions;
    constructor(subdomainPath: string, streamrWebSocketPort: number, restApiUrl: string, restApiCaCert: string, registerRpcMethod: (serviceId: string, rpcMethodName: string, method: (request: SessionIdRequest, context: ServerCallContext) => Promise<SessionIdResponse>) => void);
    start(): Promise<void>;
    private checkSubdomainValidity;
    private loadSubdomainFromDisk;
    stop(): Promise<void>;
    private scheduleCertificateUpdate;
    private createCertificate;
    private updateCertificate;
    updateSubdomainIpAndPort: () => Promise<void>;
    getSessionId(request: SessionIdRequest, _context: ServerCallContext): Promise<SessionIdResponse>;
}
export {};
