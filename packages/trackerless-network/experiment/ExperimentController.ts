import http from 'http'
import { Socket } from 'net'
import WebSocket from 'ws'
import { ExperimentClientMessage, ExperimentServerMessage, Hello, JoinExperiment } from './generated/packages/trackerless-network/experiment/Experiment'
import { Any } from '../generated/google/protobuf/any'
import { waitForCondition } from '@streamr/utils'
import { PeerDescriptor } from '@streamr/dht'
import { sample } from 'lodash'


interface ExperimentNode {
    socket: WebSocket
    peerDescriptor?: PeerDescriptor
}
export class ExperimentController {

    private httpServer?: http.Server
    private wss?: WebSocket.Server
    private clients: Map<string, ExperimentNode> = new Map()
    private readonly nodeCount: number 
    private readonly results: Map<string, any> = new Map()

    constructor(nodeCount: number) {
        this.nodeCount = nodeCount
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
                    }
                })
            })
        })
        this.httpServer.listen(7070)
    }

    async waitForClients(): Promise<void> {
        await waitForCondition(() => this.clients.size === this.nodeCount, 120000, 1000)
    }

    async startEntryPoint(): Promise<string> {
        const entryPoint = sample(Array.from(this.clients.keys()))!
        const instruction = ExperimentServerMessage.create({
            instruction: {
                oneofKind: 'start',
                start: {
                    entryPoints: [],
                    asEntryPoint: true,
                    nodeId: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                    join: true
                }
            }
        })
        this.clients.get(entryPoint)!.socket.send(ExperimentServerMessage.toBinary(instruction))
        await waitForCondition(() => this.clients.get(entryPoint)!.peerDescriptor !== undefined, 15000, 1000)
        return entryPoint
    }

    async startNodes(entryPoint: string, join = true): Promise<void> {
        const entryPointPeerDescriptor = this.clients.get(entryPoint)!.peerDescriptor!
        const nodes = Array.from(this.clients.keys()).filter((id) => id !== entryPoint)
        await Promise.all(nodes.map((id) => {
            const instruction = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'start',
                    start: {
                        entryPoints: [entryPointPeerDescriptor],
                        asEntryPoint: false,
                        join
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

    getResults(): Map<string, any> {
        return this.results
    }

}
