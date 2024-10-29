import http from 'http'
import { Socket } from 'net'
import WebSocket from 'ws'
import { ExperimentClientMessage, ExperimentServerMessage, Hello, InstructionCompleted, JoinExperiment, RoutingExperiment } from './generated/packages/trackerless-network/experiment/Experiment'
import { Any } from '../generated/google/protobuf/any'
import { StreamPartID, waitForCondition } from '@streamr/utils'
import { areEqualPeerDescriptors, PeerDescriptor } from '@streamr/dht'
import { sample } from 'lodash'
import fs from 'fs'

interface ExperimentNode {
    socket: WebSocket
    peerDescriptor?: PeerDescriptor
}

const writeResultsRow = (file: string, line: string) => {
    const dir = file.split('/').slice(0, -1).join('/')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(file, line + '\n')
}

export class ExperimentController {

    private httpServer?: http.Server
    private wss?: WebSocket.Server
    private clients: Map<string, ExperimentNode> = new Map()
    private readonly nodeCount: number 
    private readonly results: Map<string, any> = new Map()
    private readonly propagationResults: Map<string, string[]> = new Map()
    private instructionsCompleted = 0
    private readonly experimentId: string

    constructor(nodeCount: number) {
        this.nodeCount = nodeCount
        this.experimentId = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
    }


    // General flow:
        // Start N instances in different regions
        // Wait for instances to be up
        // wait for the number of connections to be N
        // Send instructions to run an experiment to instances one by one
        // Collect data? (nodes could push results to S3?)
        // Analyse data


    // Control experiment 1: layer 0 join times

    // Control experiment 2: routing from node to node 

    // Control experiment 3: time to data (storage, layer1 join, time to first neighbor, time to fist message)

    // Control experiment 4: mean message propagation time

    createServer() {
        this.httpServer = http.createServer()
        this.wss = new WebSocket.Server({ noServer: true })

        this.httpServer.on('upgrade', (request: http.IncomingMessage, socket: Socket, head: Buffer) => {    
            this.wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
                ws.on('message', (msg) => {
                    const message = ExperimentClientMessage.fromBinary(new Uint8Array(msg as Buffer))
                    if (message.payload.oneofKind === 'hello') {
                        this.clients.set(message.id, { socket: ws })
                    } else if (message.payload.oneofKind === 'started') {
                        const started = message.payload.started
                        this.clients.set(message.id, { socket: ws, peerDescriptor: started.peerDescriptor! })
                    } else if (message.payload.oneofKind === 'experimentResults') {
                        this.results.set(message.id, message.payload.experimentResults)
                    } else if (message.payload.oneofKind === 'instructionCompleted') {
                        this.instructionsCompleted += 1
                    } else if (message.payload.oneofKind === 'propagationResults') {
                        this.propagationResults.set(message.id, message.payload.propagationResults.results)
                        writeResultsRow(`results/${this.experimentId}/propagationResult`, message.id + ',' + message.payload.propagationResults.results.join(','))
                    }
                })
            })
        })
        this.httpServer.listen(7070)
    }

    async waitForClients(): Promise<void> {
        await waitForCondition(() => this.clients.size === this.nodeCount, 120000, 1000)
    }

    async startEntryPoint(storeRoutingPaths = false): Promise<string> {
        const entryPoint = sample(Array.from(this.clients.keys()))!
        const instruction = ExperimentServerMessage.create({
            instruction: {
                oneofKind: 'start',
                start: {
                    entryPoints: [],
                    asEntryPoint: true,
                    nodeId: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                    join: true,
                    storeRoutingPaths
                }
            }
        })
        this.clients.get(entryPoint)!.socket.send(ExperimentServerMessage.toBinary(instruction))
        await waitForCondition(() => this.clients.get(entryPoint)!.peerDescriptor !== undefined, 15000, 1000)
        return entryPoint
    }

    async startNodes(entryPoint: string, join = true, storeRoutingPaths = false): Promise<void> {
        const entryPointPeerDescriptor = this.clients.get(entryPoint)!.peerDescriptor!
        const nodes = Array.from(this.clients.keys()).filter((id) => id !== entryPoint)
        await Promise.all(nodes.map((id) => {
            const instruction = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'start',
                    start: {
                        entryPoints: [entryPointPeerDescriptor],
                        asEntryPoint: false,
                        join,
                        storeRoutingPaths
                    }
                }
            })
            this.clients.get(id)!.socket.send(ExperimentServerMessage.toBinary(instruction))
        }))
        await waitForCondition(() => Array.from(this.clients.values()).every((node) => node.peerDescriptor !== undefined), 30000, 1000)
    }

    async runJoinExperiment(entryPointId: string): Promise<void> {
        const entryPoint = this.clients.get(entryPointId)!
        const nodes = Array.from(this.clients.values()).filter((node) => node.peerDescriptor !== entryPoint.peerDescriptor)
        await Promise.all(nodes.map((node) => {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'joinExperiment',
                    joinExperiment: JoinExperiment.create({
                        entryPoints: [entryPoint.peerDescriptor!]
                    })
                }
            })
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }))
        await waitForCondition(() => this.results.size === this.nodeCount - 1, 30000, 1000)
    }

    async runRoutingExperiment(): Promise<void> {
        const nodes = Array.from(this.clients.values())
        await Promise.all(nodes.map((node) => {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'routingExperiment',
                    routingExperiment: RoutingExperiment.create({
                        routingTargets: nodes.map((target) => target.peerDescriptor!).filter((a) => !areEqualPeerDescriptors(a, node.peerDescriptor!))
                    })
                }
            })
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }))
        await waitForCondition(() => this.results.size === this.nodeCount, 30000, 1000)
    }

    async joinStreamPart(streamPartId: StreamPartID): Promise<void> {
        this.instructionsCompleted = 0
        const nodes = Array.from(this.clients.values())
        await Promise.all(nodes.map((node) => {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'joinStreamPart',
                    joinStreamPart: {
                        streamPartId: streamPartId.toString(),
                        neighborCount: 4
                    }
                }
            })
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }))
        await waitForCondition(() => this.instructionsCompleted === this.nodeCount, 30000, 1000)
    }

    async publishMessage(streamPartId: StreamPartID): Promise<void> {
        this.instructionsCompleted = 0
        const message = ExperimentServerMessage.create({
            instruction: {
                oneofKind: 'publishMessage',
                publishMessage: {
                    streamPartId: streamPartId.toString()
                }
            }
        })
        const nodes = Array.from(this.clients.values())
        await Promise.all(nodes.map((node) => {
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }))
        await waitForCondition(() => this.instructionsCompleted === this.nodeCount, 30000, 1000)
    }

    async pullPropagationResults(streamPartId: StreamPartID): Promise<void> {
        const nodes = Array.from(this.clients.values())
        await Promise.all(nodes.map((node) => {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'getPropagationResults',
                    getPropagationResults: {
                        streamPartId: streamPartId.toString()
                    }
                }
            })
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }))
        await waitForCondition(() => this.propagationResults.size === this.nodeCount, 30000, 1000)
    }

    getPropagationResults(): Map<string, string[]> {
        return this.propagationResults
    }

    getResults(): Map<string, any> {
        return this.results
    }

}
