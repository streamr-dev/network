import { v4 } from 'uuid'
import WebSocket from 'ws'
import { NetworkNode } from '../src/NetworkNode'
import { NetworkStack } from '../src/NetworkStack'
import { ExperimentClientMessage, ExperimentServerMessage, GetRoutingPath, Hello, RoutingPath } from './generated/packages/trackerless-network/experiment/Experiment'
import { DhtCallContext, DhtNode, NodeType, PeerDescriptor, toNodeId } from '@streamr/dht'
import { binaryToHex, hexToBinary, Logger, StreamPartID, StreamPartIDUtils, utf8ToBinary, wait, until } from '@streamr/utils'
import { ContentType, EncryptionType, SignatureType, StreamMessage } from '../generated/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RoutingExperimentRpcClient } from './generated/packages/trackerless-network/experiment/Experiment.client'
import { chunk, now } from 'lodash'
import path from 'path'
const ping = require('ping')

const createStreamMessage = (streamPartId: StreamPartID, id: string, region: number) => {
    const message: StreamMessage = {
        messageId: {
            streamId: StreamPartIDUtils.getStreamID(streamPartId),
            streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
            timestamp: Date.now(),
            sequenceNumber: 0,
            publisherId: hexToBinary(binaryToHex(utf8ToBinary(id))),
            messageChainId: 'msgChainId'
        },
        body: {
            oneofKind: 'contentMessage',
            contentMessage: {
                content: utf8ToBinary(JSON.stringify({ id, route: [
                    { id, time: Date.now(), region }
                ]})),
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE,
            }
        },
        signatureType: SignatureType.SECP256K1,
        signature: hexToBinary('0x1234')
    }
    return message
}

const logger = new Logger(module)

export class ExperimentNodeWrapper {
    private readonly id: string
    private readonly controllerUrl: string
    private readonly publicIp: string
    private node?: NetworkNode
    private socket?: WebSocket
    private interval?: NodeJS.Timeout

    constructor(controllerUrl: string, publicIp: string, id?: string) {
        this.controllerUrl = controllerUrl
        this.publicIp = publicIp
        this.id = id ?? v4()
        logger.info('Created node: ', { id: this.id })
    }

    async run() {
        await this.connect()
    }

    async startNode(startWsServer: boolean, entryPoints: PeerDescriptor[], asEntryPoint: boolean, join: boolean, storeRoutingPaths: boolean, storeMessagePaths: boolean, nodeId?: string) {
        logger.info('starting node', { storeRoutingPaths: storeRoutingPaths })
        this.createNode(startWsServer, entryPoints, asEntryPoint, storeRoutingPaths, storeMessagePaths, nodeId)
        await this.node!.start(join)
        this.node!.registerExternalRoutingRpcMethod(GetRoutingPath, RoutingPath, 'getRoutingPath', async (request: GetRoutingPath, context: ServerCallContext): Promise<RoutingPath> => {
            const source = (context as DhtCallContext).incomingSourceDescriptor
            const { sendTime } = request 
            return {
                path: (this.node!.stack.getControlLayerNode() as DhtNode).getPathForMessage(toNodeId(source!)),
                sendTime: Date.now(),
                timeToReceiver: Date.now() - sendTime
            }
        })
        const peerDescriptor = this.node!.getPeerDescriptor()
        const message = ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'started',
                started: {
                    peerDescriptor,
                    timeToJoin: 0
                }
            }
        })
        this.send(message)
        this.interval = setInterval(() => {
            const memoryUsedInMB = process.memoryUsage().heapUsed
            if (memoryUsedInMB > 150 * 1024 * 1024) {
                logger.warn('Memory usage exceeded 150MB, sending alert')
                const message = ExperimentClientMessage.create({
                    id: this.id,
                    payload: {
                        oneofKind: 'highMemoryAlarm',
                        highMemoryAlarm: {
                            memoryUsage: memoryUsedInMB
                        }
                    }
                })
                this.send(message)
            }
            // logger.info('connection stats', { 
            //     connections: this.node?.stack.getControlLayerNode().getConnectionsView().getConnectionCount() ?? 0,
            //     layer0Neighbors: this.node?.stack.getControlLayerNode().getNeighbors().length ?? 0
            // })
        }, 30 * 1000)
    }

    createNode(startWsServer: boolean, entryPoints: PeerDescriptor[], asEntryPoint: boolean, storeRoutingPaths: boolean, storeMessagePaths: boolean, nodeId?: string): void {
        let configPeerDescriptor: PeerDescriptor | undefined
        if (asEntryPoint) {
            configPeerDescriptor = {
                nodeId: hexToBinary(nodeId!),
                websocket: {
                    host: this.publicIp,
                    port: 44444,
                    tls: false
                },
                type: NodeType.NODEJS
            }
        }
        const layer0config = {
            entryPoints: asEntryPoint ? [configPeerDescriptor!] : entryPoints,
            websocketPortRange: startWsServer ? { min: 44444, max: 44888 } : undefined,
            websocketServerEnableTls: false,
            peerDescriptor: configPeerDescriptor,
            webrtcAllowPrivateAddresses: true,
            storeRoutingPaths,
            networkConnectivityTimeout: 30000,
            iceServers: [
                {
                    url: "stun:stun.streamr.network",
                    port: 5349
                }
            ]
        }
        const stack = new NetworkStack({
            layer0: layer0config,
            networkNode: {
                experimentId: this.id,
                includeRouteToMessages: storeMessagePaths,
                propagationResultPath: path.resolve(path.resolve(__dirname), this.id + '_' + v4()  + '_messages.json')
            }
        })
        this.node = new NetworkNode(stack)
    }

    async connect() {
        this.socket = new WebSocket(this.controllerUrl)
        this.socket.binaryType = 'nodebuffer'
        this.socket.on('open', () => {
            logger.info('connected to server')
            const helloMessage = ExperimentClientMessage.create({
                id: this.id,
                payload: { 
                    oneofKind: 'hello', 
                    hello: Hello.create({
                        ip: this.publicIp,
                    })
                }
            })
            this.socket!.send(ExperimentClientMessage.toBinary(helloMessage))
        })

        this.socket!.on('message', (data) => {
            // These should be commands to run a task for an experiment
            const message = ExperimentServerMessage.fromBinary(new Uint8Array(data as ArrayBuffer))
            if (message.instruction.oneofKind === 'start') {
                const instruction = message.instruction.start
                setImmediate(() => this.startNode(instruction.startWsServer, instruction.entryPoints, instruction.asEntryPoint, instruction.join, instruction.storeRoutingPaths, instruction.storeMessagePaths, instruction.nodeId))
            } else if (message.instruction.oneofKind === 'joinExperiment') {
                const instruction = message.instruction.joinExperiment
                setImmediate(() => this.joinExperiment(instruction.entryPoints))
            } else if (message.instruction.oneofKind === 'joinStreamPart') {
                const instruction = message.instruction.joinStreamPart
                setImmediate(() => this.joinStreamPart(instruction.streamPartId, instruction.neighborCount))
            } else if (message.instruction.oneofKind === 'publishMessage') {
                const instruction = message.instruction.publishMessage
                setImmediate(() => this.onPublishInstruction(instruction.streamPartId))
            } else if (message.instruction.oneofKind === 'getPropagationResults') {
                const instruction = message.instruction.getPropagationResults
                setImmediate(() => this.reportPropagationResults())
            } else if (message.instruction.oneofKind === 'routingExperiment') {
                const instruction = message.instruction.routingExperiment
                setImmediate(() => this.routingExperiment(instruction.routingTargets))
            } else if (message.instruction.oneofKind === 'publishOnInterval') {
                const instruction = message.instruction.publishOnInterval
                setImmediate(() => this.publishOnInterval(instruction.streamPartId, instruction.interval))
            } else if (message.instruction.oneofKind === 'measureTimeToData') {
                const instruction = message.instruction.measureTimeToData
                setImmediate(() => this.measureTimeToData(instruction.startWsServer, instruction.streamPartId, instruction.entryPoints))
            } else if (message.instruction.oneofKind === 'pingExperiment') {
                const instruction = message.instruction.pingExperiment
                setImmediate(() => this.pingExperiment(instruction.ips))
            } else if (message.instruction.oneofKind === 'getNeighborsRequest') {
                const instruction = message.instruction.getNeighborsRequest
                setImmediate(() => this.getNeighbors(instruction.streamPartId))
            } else if (message.instruction.oneofKind === 'stopNodeRequest') {
                setImmediate(async () => {
                    if (this.interval) {
                        clearInterval(this.interval)
                    }
                    await wait(5000)
                    process.exit(1)
                })
            }
        })
    }

    send(msg: ExperimentClientMessage): void {
        this.socket!.send(ExperimentClientMessage.toBinary(msg))
    }

    async joinExperiment(entryPoints: PeerDescriptor[]): Promise<void> {
        logger.info('running joining experiment')
        const startTime = Date.now()
        await this.node!.stack.getControlLayerNode().joinDht(entryPoints)
        const runTime = Date.now() - startTime
        const results = ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'experimentResults',
                experimentResults: {
                    results: `${runTime}`
                }
            }
        })
        this.send(results)
    }

    async joinStreamPart(streamPartId: string, neighborCount: number): Promise<void> {
        logger.info('joining stream part ', { streamPartId, neighborCount })
        const streamPart = StreamPartIDUtils.parse(streamPartId)
        await this.node!.join(streamPart, { minCount: neighborCount, timeout: 90000 })
        const results = ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'instructionCompleted',
                instructionCompleted: {}
            }
        })
        this.send(results)
    }

    async routingExperiment(nodes: PeerDescriptor[]): Promise<void> {
        logger.info('running routing experiment')
        const client = this.node!.createExternalRoutingRpcClient(RoutingExperimentRpcClient)
        const results: any = []
        const batches = chunk(nodes, 16)
        for (const batch of batches) {
            await Promise.all(batch.map(async (node) => {
                try {
                    const started = Date.now()
                    const result = await client.getRoutingPath(GetRoutingPath.create({
                        sendTime: started
                    }), {
                        sourceDescriptor: this.node!.getPeerDescriptor(),
                        targetDescriptor: node,
                        timeout: 10000
                    })
                    const rtt = Date.now() - started
                    const timeToRequestor = Date.now() - result.sendTime
                    results.push({ source: toNodeId(this.node!.getPeerDescriptor()), from: toNodeId(node), path: result.path.map((p) => toNodeId(p)), rtt, timeToReceiver: result.timeToReceiver, timeToRequestor})
                } catch (e) {
                    logger.error(e)
                    results.push({ source: toNodeId(this.node!.getPeerDescriptor()), from: toNodeId(node), path: [], rtt: 10000, timeToReceiver: 10000, timeToRequestor: 10000})
                } 
            }))   
        }
        this.send(ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'experimentResults',
                experimentResults: {
                    results: JSON.stringify(results)
                }
            }
        }))
    }

    async onPublishInstruction(streamPartId: string): Promise<void> {
        await this.publishMessage(streamPartId)
        const results = ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'instructionCompleted',
                instructionCompleted: {}
            }
        })
        this.send(results)
    }

    async publishMessage(streamPartId: string): Promise<void> {
        const streamPart = StreamPartIDUtils.parse(streamPartId)
        const message = createStreamMessage(streamPart, this.id, this.node!.getPeerDescriptor().region!)
        await this.node!.broadcast(message)
    }

    async publishOnInterval(streamPartId: string, interval: number) {
        const streamPart = StreamPartIDUtils.parse(streamPartId)
        setInterval(() => this.publishMessage(streamPart), interval)
    }

    async measureTimeToData(startWsServer: boolean, streamPartId: string, entryPoints: PeerDescriptor[]): Promise<void> {
        logger.info('running time to data experiment')
        this.createNode(startWsServer, entryPoints, false, false, false)
        await this.node!.start()
        const streamPart = StreamPartIDUtils.parse(streamPartId)
        const startTime = Date.now()
        await this.node!.join(streamPart)
        try {
            await until(() => 
                this.node!.stack.getContentDeliveryManager().getTimeToDataMeasurements(streamPart).messageReceivedTimestamp !== undefined
                && this.node!.stack.getContentDeliveryManager().getTimeToDataMeasurements(streamPart).layer1JoinTime !== undefined
            , 90000, 1000)
        } catch (err) {
            logger.error('timeout waiting for time to data measurements')
        }
        
        const measurements = this.node!.stack.getContentDeliveryManager().getTimeToDataMeasurements(streamPart)
        const payload = {
            messageReceivedTimestamp: measurements.messageReceivedTimestamp ?? Date.now(),
            layer1JoinTime: measurements.layer1JoinTime ?? 60000,
            entryPointsFetch: measurements.entryPointsFetch ?? 60000,
            firstNeighbor: measurements.firstNeighborConnectedTimestamp ?? 60000,
            startTime
        } 
        const results = ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'experimentResults',
                experimentResults: {
                    results: JSON.stringify(payload)
                }
            }
        })
        this.send(results)
    }

    async reportPropagationResults(): Promise<void> {
        logger.info('reporting propagation results')
        const results = await this.node!.stack.getContentDeliveryManager().getPropagationResults()
        logger.info('propagation results reported')
        this.send(ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'propagationResults',
                propagationResults: {
                    results: results
                }
            }
        }))
    }

    async pingExperiment(ips: string[]): Promise<void> {
        logger.info('running ping experiment')
        const results: any = []
        for (const ip of ips) {
            try {
                logger.info('pinging', { ip })
                const result = await ping.promise.probe(ip)
                results.push({ ip, time: result.time })
            } catch (e) {
                results.push({ ip, time: 10000 })
            }
        }
        this.send(ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'experimentResults',
                experimentResults: {
                    results: JSON.stringify(results)
                }
            }
        }))
    }

    getNeighbors(streamPartId: string): void {
        const streamPart = StreamPartIDUtils.parse(streamPartId)
        const neighbors = this.node!.getNeighbors(streamPart).map((n) => n.toString())
        this.send(ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'getNeighborsResponse',
                getNeighborsResponse: {
                    neighbors
                }
            }
        }))
    }

    async stop() {
        logger.info('stopping node')
        this.node!.stop()
        this.socket!.close()
    }

}
