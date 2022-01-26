import { ServerWsEndpoint } from './ServerWsEndpoint_simulator'
import NodeClientWsEndpoint from './NodeClientWsEndpoint_simulator'
import { PeerInfo } from '../connection/PeerInfo'
import { DisconnectionReason, DisconnectionCode } from '../connection/ws/AbstractWsEndpoint'
import { IWsSimulator } from './IWsSimulator'
import { NodeWebRtcConnection } from './NodeWebRtcConnection_simulator'

export class SimulatedNode {
    constructor(
        public wsServerEndpoint: ServerWsEndpoint | null,
        public wsClientEndpoint: NodeClientWsEndpoint |null, 
        //public webRtcEnpoint: SimulatedWebRtcEndpoint | null
    ) {
    }
}

export function cleanAddress(addr: string): string {        

    if (typeof addr == 'undefined') {
        console.warn(new Error().stack)
    }
    
    let ret = ''
    if (addr.startsWith('ws://')) {
        ret = addr.substr(5)
    }
    else if (addr.startsWith('wss://')) {
        ret = addr.substr(6) 
    }
    else {
        ret = addr
    }
    if (ret.endsWith('/ws')) {
        ret = ret.substr(0, ret.length - 3)
    }

    return ret
}
export class Simulator implements IWsSimulator {
    
    private static singleton: Simulator

    private nodes: { [id: string]: SimulatedNode } = {}
    private wsEndpoints: { [address: string]: ServerWsEndpoint | NodeClientWsEndpoint} = {}
    //private webRtcEndpoints: { [address: string]: SimulatedWebRtcEndpoint } = {}

    private webRtcConnections: {[peerId: string]: {[targetId: string]: NodeWebRtcConnection} } = {}

    private constructor() {}

    public static instance(): Simulator {
        if (!Simulator.singleton) {
            Simulator.singleton = new Simulator()
        }
        return Simulator.singleton
    }

    public addServerWsEndpoint(peerInfo: PeerInfo, host: string, port: number, endpoint: ServerWsEndpoint): void {
        if (!this.nodes.hasOwnProperty(peerInfo.peerId)) {
            this.nodes[peerInfo.peerId] = new SimulatedNode(endpoint, null)
        }    
        else {
            this.nodes[peerInfo.peerId].wsServerEndpoint = endpoint
        }

        const addr = host + ':' + port
        this.wsEndpoints[addr] = endpoint
    }

    public addClientWsEndpoint(peerInfo: PeerInfo, ownAddress: string, endpoint: NodeClientWsEndpoint): void {
        if (!this.nodes.hasOwnProperty(peerInfo.peerId)) {
            this.nodes[peerInfo.peerId] = new SimulatedNode(null, endpoint)
        }    
        else {
            this.nodes[peerInfo.peerId].wsClientEndpoint = endpoint
        }

        this.wsEndpoints[ownAddress] = endpoint
    }

    public async wsDisconnect(fromAddress: string, fromInfo: PeerInfo, toAddress: string, code: DisconnectionCode, 
        reason: DisconnectionReason | string): Promise<void> {
        this.wsEndpoints[cleanAddress(toAddress)].handleIncomingDisconnection(cleanAddress(fromAddress), fromInfo, code, reason)
    }

    public async wsSend(fromAddress: string, fromInfo: PeerInfo, toAddress: string, message: string): Promise<void> {
        this.wsEndpoints[cleanAddress(toAddress)].handleIncomingMessage(cleanAddress(fromAddress), fromInfo, message)
    }
    
    public async wsConnect(fromAddress: string, fromInfo: PeerInfo, toAddress: string): Promise<void> {
        
        this.wsEndpoints[cleanAddress(toAddress)].handleIncomingConnection(cleanAddress(fromAddress), fromInfo)
        //return this.wsEndpoints[this.cleanAddress(toAddress)].
    }

    public addWebRtcConnection(fromId: string, toId: string, connection: NodeWebRtcConnection): void {
        if (!this.webRtcConnections.hasOwnProperty(fromId)) {
            this.webRtcConnections[fromId] = {}
        }

        this.webRtcConnections[fromId][toId] = connection
    }

    //public async webRtcSend(fromId: string, toId: string, message: string): Promise<void> 
    public webRtcSend(fromId: string, toId: string, message: string): void {
        
        this.webRtcConnections[toId][fromId].handleIncomingMessage(message)
    }

    //public async webRtcDisconnect(fromId: string, toId: string): Promise<void> 
    public webRtcDisconnect(fromId: string, toId: string): void {
        if  (this.webRtcConnections.hasOwnProperty(toId) && this.webRtcConnections[toId].hasOwnProperty(fromId)) {
            this.webRtcConnections[toId][fromId].handleIncomingDisconnection()
        }
    }

    public webRtcConnect(fromId: string, toId: string): void {
        if  (this.webRtcConnections.hasOwnProperty(toId) && this.webRtcConnections[toId].hasOwnProperty(fromId)) {
            this.webRtcConnections[toId][fromId].handleIncomingConnection()
        }
    } 
}