import http from 'http'
import { Socket } from 'net'
import WebSocket from 'ws'
import { ExperimentClientMessage, ExperimentServerMessage, Hello, InstructionCompleted, JoinExperiment, RoutingExperiment } from './generated/packages/trackerless-network/experiment/Experiment'
import { Logger, StreamPartID, StreamPartIDUtils, wait, waitForCondition } from '@streamr/utils'
import { areEqualPeerDescriptors, PeerDescriptor } from '@streamr/dht'
import { chunk, sample } from 'lodash'
import fs from 'fs'

interface ExperimentNode {
    socket: WebSocket
    peerDescriptor?: PeerDescriptor
    ip?: string
}

const writeResultsRow = (file: string, line: string) => {
    const dir = file.split('/').slice(0, -1).join('/')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(file, line + '\n')
}

const logger = new Logger(module)

export class ExperimentController {

    private httpServer?: http.Server
    private wss?: WebSocket.Server
    private clients: Map<string, ExperimentNode> = new Map()
    private readonly nodeCount: number
    private readonly resultFilePath: string
    private readonly resultsReceived: Set<string> = new Set()
    private instructionsCompleted = 0

    constructor(nodeCount: number, resultFilePath: string) {
        this.nodeCount = nodeCount
        this.resultFilePath = resultFilePath
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
                        const ip = message.payload.hello.ip
                        logger.info('received hello message from ' + message.id)
                        this.clients.set(message.id, { socket: ws, ip })
                    } else if (message.payload.oneofKind === 'started') {
                        const started = message.payload.started
                        this.clients.set(message.id, { socket: ws, peerDescriptor: started.peerDescriptor! })
                    } else if (message.payload.oneofKind === 'experimentResults') {
                        writeResultsRow(this.resultFilePath, JSON.stringify({ id: message.id, results: message.payload.experimentResults.results }))
                        this.resultsReceived.add(message.id)
                    } else if (message.payload.oneofKind === 'instructionCompleted') {
                        this.instructionsCompleted += 1
                    } else if (message.payload.oneofKind === 'propagationResults') {
                        this.resultsReceived.add(message.id)
                        writeResultsRow(this.resultFilePath, JSON.stringify({ id: message.id, results: message.payload.propagationResults.results }))
                    }
                })
            })
        })
        this.httpServer.listen(7070)
    }

    async waitForClients(onConditionFn?: () => void): Promise<void> {
        await waitForCondition(() => { 
            if (onConditionFn !== undefined) {
                onConditionFn()
            }
            return this.clients.size === this.nodeCount 
        }, 20 * 60 * 1000, 10000)
        
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
        await waitForCondition(() => this.resultsReceived.size === this.nodeCount - 1, 30000, 1000)
    }

    async runRoutingExperiment(): Promise<void> {
        const nodes = Array.from(this.clients.values())
        await this.runBatchedOperation(nodes, 2, async (node) => {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'routingExperiment',
                    routingExperiment: RoutingExperiment.create({
                        routingTargets: nodes.map((target) => target.peerDescriptor!).filter((a) => !areEqualPeerDescriptors(a, node.peerDescriptor!))
                    })
                }
            })
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }, (current) => current === this.resultsReceived.size)
    }

    async joinStreamPart(streamPartId: StreamPartID): Promise<void> {
        this.instructionsCompleted = 0
        const nodes = Array.from(this.clients.values())
        await this.runBatchedOperation(nodes, 8, async (node) => {
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
        }, (current) => current === this.instructionsCompleted)
        await waitForCondition(() => this.instructionsCompleted === this.nodeCount, 60000, 1000)
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
        await this.runBatchedOperation(nodes, 2, async (node) => {
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }, (current) => current === this.instructionsCompleted)
        await waitForCondition(() => this.instructionsCompleted === this.nodeCount, 30000, 1000)
    }

    async runTimeToDataExperiment(entryPoint: string): Promise<void> {
        const streamPartId = 'experiment#0'
        const publisher = sample(Array.from(this.clients.keys()).filter((id) => id !== entryPoint))!
        await this.startPublisher(publisher, streamPartId)
        const subsribers = Array.from(this.clients.keys()).filter((id) => id !== publisher)
        for (const subscriber of subsribers) {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'measureTimeToData',
                    measureTimeToData: {
                        streamPartId
                    }
                }
            })
            this.clients.get(subscriber)!.socket.send(ExperimentServerMessage.toBinary(message))
            await wait(500)
        }
        await waitForCondition(() => this.resultsReceived.size === this.nodeCount - 1, 30000, 1000)
    }

    async runScalingJoinExperiment(entryPoint: string): Promise<void> {
        const joinedNodes: string[] = []
        joinedNodes.push(entryPoint)
        const nodes = Array.from(this.clients.keys()).filter((id) => id !== entryPoint)
        for (const node of nodes) {
            const randomEntryPoint = sample(joinedNodes)!
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'joinExperiment',
                    joinExperiment: JoinExperiment.create({
                        entryPoints: [this.clients.get(randomEntryPoint)!.peerDescriptor!]
                    })
                }
            })
            this.clients.get(node)!.socket.send(ExperimentServerMessage.toBinary(message))
            await waitForCondition(() => this.resultsReceived.has(node), 30000, 50)
            joinedNodes.push(node)
        }
    }

    async runPropagationExperiment(streamPartId: string): Promise<void> {
        const streamPart = StreamPartIDUtils.parse('experiment#0')
        await this.joinStreamPart(streamPart)
        logger.info('all nodes joined stream part')
        await this.publishMessage(streamPart)
        logger.info('all nodes published message')
        await this.pullPropagationResults(streamPart)      
    }

    async startPublisher(publisher: string, streamPartId: string): Promise<void> {
        const message = ExperimentServerMessage.create({
            instruction: {
                oneofKind: 'publishOnInterval',
                publishOnInterval: {
                    streamPartId,
                    interval: 1000
                }
            }
        })
        this.clients.get(publisher)!.socket.send(ExperimentServerMessage.toBinary(message))
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
        await waitForCondition(() => this.resultsReceived.size === this.nodeCount, 3 * 60 * 1000, 1000)
    }

    async stop(): Promise<void> {
        Array.from(this.clients.values()).map((client) => client.socket.close())
        this.httpServer!.close()
        this.wss!.close()
    }

    private async runBatchedOperation(nodes: ExperimentNode[], batchSize: number, operation: (node: ExperimentNode) => Promise<void>, untilCondition: (requiredCount: number) => boolean) {
        const batches = chunk(nodes, batchSize)
        for (let i in batches) {
            const batch = batches[i]
            await Promise.all(batch.map((node) => operation(node)))
            const instructedNodeCount = batch.length === batchSize ? batchSize * (parseInt(i) + 1) : batchSize * parseInt(i) + batch.length
            await waitForCondition(() => untilCondition(instructedNodeCount), 2 * 60 * 1000, 1000)
            logger.info(`batch ${i} completed, ${nodes.length - instructedNodeCount} nodes remaining`)
        }
    }

    getIps(): Set<string> {
        return new Set(Array.from(this.clients.values()).map((node) => node.ip!))
    }

    hasIp(ip: string): boolean {
        return Array.from(this.clients.values()).some((node) => node.ip === ip)
    }

}
