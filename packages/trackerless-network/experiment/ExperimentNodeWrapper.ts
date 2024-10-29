import { v4 } from 'uuid'
import WebSocket from 'ws'
import { NetworkNode } from '../src/NetworkNode'
import { NetworkStack } from '../src/NetworkStack'
import { ExperimentClientMessage, ExperimentServerMessage, GetRoutingPath, Hello, RoutingPath } from './generated/packages/trackerless-network/experiment/Experiment'
import { DhtCallContext, DhtNode, NodeType, PeerDescriptor, toNodeId } from '@streamr/dht'
import { binaryToHex, hexToBinary, StreamIDUtils, StreamPartID, StreamPartIDUtils, utf8ToBinary } from '@streamr/utils'
import { ContentType, EncryptionType, SignatureType, StreamMessage } from '../generated/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { RoutingExperimentRpcClient } from './generated/packages/trackerless-network/experiment/Experiment.client'

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

export class ExperimentNodeWrapper {
    private readonly id = v4()
    private node?: NetworkNode
    private socket?: WebSocket
    constructor() {
        console.log(this.id)
    }

    async run() {
        await this.connect()
    }

    async startNode(entryPoints: PeerDescriptor[], asEntryPoint: boolean, join: boolean, storeRoutingPaths: boolean, nodeId?: string) {
        console.log('starting node', storeRoutingPaths)
        let configPeerDescriptor: PeerDescriptor | undefined
        if (asEntryPoint) {
            configPeerDescriptor = {
                nodeId: hexToBinary(nodeId!),
                websocket: {
                    host: '127.0.0.1',
                    port: 44444,
                    tls: false
                },
                type: NodeType.NODEJS
            }
        }
        const layer0config = {
            entryPoints: asEntryPoint ? [configPeerDescriptor!] : entryPoints,
            websocketPortRange: { min: 44444, max: 44888 },
            websocketServerEnableTls: false,
            peerDescriptor: configPeerDescriptor,
            webrtcAllowPrivateAddresses: true,
            storeRoutingPaths
        }
        const stack = new NetworkStack({
            layer0: layer0config,
            networkNode: {
                experimentId: this.id
            }
        })
        this.node = new NetworkNode(stack)
        await this.node.start(join)
        this.node.registerExternalRoutingRpcMethod(GetRoutingPath, RoutingPath, 'getRoutingPath', async (request: GetRoutingPath, context: ServerCallContext): Promise<RoutingPath> => {
            const source = (context as DhtCallContext).incomingSourceDescriptor
            return {
                path: (this.node!.stack.getControlLayerNode() as DhtNode).getPathForMessage(toNodeId(source!))
            }
        })
        const peerDescriptor = this.node.getPeerDescriptor()
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
    }

    async connect() {
        this.socket = new WebSocket('ws://localhost:7070')
        this.socket.binaryType = 'nodebuffer'
        this.socket.on('open', () => {
            const helloMessage = ExperimentClientMessage.create({
                id: this.id,
                payload: { 
                    oneofKind: 'hello', 
                    hello: Hello.create({})
                }
            })
            this.socket!.send(ExperimentClientMessage.toBinary(helloMessage))
        })

        this.socket!.on('message', (data) => {
            // These should be commands to run a task for an experiment
            const message = ExperimentServerMessage.fromBinary(new Uint8Array(data as ArrayBuffer))
            if (message.instruction.oneofKind === 'start') {
                const instruction = message.instruction.start
                setImmediate(() => this.startNode(instruction.entryPoints, instruction.asEntryPoint, instruction.join, instruction.storeRoutingPaths, instruction.nodeId))
            } else if (message.instruction.oneofKind === 'joinExperiment') {
                const instruction = message.instruction.joinExperiment
                setImmediate(() => this.joinExperiment(instruction.entryPoints))
            } else if (message.instruction.oneofKind === 'joinStreamPart') {
                const instruction = message.instruction.joinStreamPart
                setImmediate(() => this.joinStreamPart(instruction.streamPartId, instruction.neighborCount))
            } else if (message.instruction.oneofKind === 'publishMessage') {
                const instruction = message.instruction.publishMessage
                setImmediate(() => this.publishMessage(instruction.streamPartId))
            } else if (message.instruction.oneofKind === 'getPropagationResults') {
                const instruction = message.instruction.getPropagationResults
                setImmediate(() => this.reportPropagationResults(instruction.streamPartId))
            } else if (message.instruction.oneofKind === 'routingExperiment') {
                const instruction = message.instruction.routingExperiment
                setImmediate(() => this.routingExperiment(instruction.routingTargets))
            }
        })
    }

    send(msg: ExperimentClientMessage): void {
        this.socket!.send(ExperimentClientMessage.toBinary(msg))
    }

    async joinExperiment(entryPoints: PeerDescriptor[]): Promise<void> {
        console.log('joining experiment')
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
        const streamPart = StreamPartIDUtils.parse(streamPartId)
        await this.node!.join(streamPart, { minCount: neighborCount, timeout: 20000 })
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
        const client = this.node!.createExternalRoutingRpcClient(RoutingExperimentRpcClient)
        const results: any = []
        await Promise.all(nodes.map(async (node) => {
            try {
                const result = await client.getRoutingPath(GetRoutingPath.create(), {
                    sourceDescriptor: this.node!.getPeerDescriptor(),
                    targetDescriptor: node,
                    timeout: 10000,
                })
                results.push({ source: toNodeId(this.node!.getPeerDescriptor()), from: toNodeId(node), path: result.path.map((p) => toNodeId(p))})
            } catch (e) {
                console.log(e)
                results.push({ source: toNodeId(this.node!.getPeerDescriptor()), from: toNodeId(node), path: [] })
            } 
        }))
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

    async publishMessage(streamPartId: string): Promise<void> {
        const streamPart = StreamPartIDUtils.parse(streamPartId)
        const message = createStreamMessage(streamPart, this.id, this.node!.getPeerDescriptor().region!)
        await this.node!.broadcast(message)
        const results = ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'instructionCompleted',
                instructionCompleted: {}
            }
        })
        this.send(results)
    }

    reportPropagationResults(streamPart: string): void {
        const streamPartId = StreamPartIDUtils.parse(streamPart)
        const results = this.node!.stack.getContentDeliveryManager().getPropagationResults(streamPartId)
        this.send(ExperimentClientMessage.create({
            id: this.id,
            payload: {
                oneofKind: 'propagationResults',
                propagationResults: {
                    results: results.map((res) => JSON.stringify(res))
                }
            }
        }))
    }

    async stop() {
        this.node!.stop()
        this.socket!.close()
    }

}
