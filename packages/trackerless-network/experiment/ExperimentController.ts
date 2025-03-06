import http from 'http'
import { Socket } from 'net'
import WebSocket from 'ws'
import { ExperimentClientMessage, ExperimentServerMessage, Hello, InstructionCompleted, JoinExperiment, RoutingExperiment } from './generated/packages/trackerless-network/experiment/Experiment'
import { areEqualBinaries, hexToBinary, Logger, StreamPartID, StreamPartIDUtils, wait, until } from '@streamr/utils'
import { areEqualPeerDescriptors, PeerDescriptor } from '@streamr/dht'
import { chunk, last, sample, sampleSize, shuffle } from 'lodash'
import fs from 'fs'
import { memoryUsage } from 'process'

interface ExperimentNode {
    socket: WebSocket
    peerDescriptor?: PeerDescriptor
    ip?: string
}

export const writeResultsRow = (file: string, line: string) => {
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
    private readonly topologyFilePath: string
    private readonly resultsReceived: Set<string> = new Set()
    private readonly topologyResult: Map<string, string[]> = new Map()
    private instructionsCompleted = 0

    constructor(nodeCount: number, resultFilePath: string, topologyFilePath: string) {
        this.nodeCount = nodeCount
        this.resultFilePath = resultFilePath
        this.topologyFilePath = topologyFilePath
    }


    // General flow:
        // Start N instances in different regions
        // Wait for instances to be up
        // wait for the number of connections to be N
        // Send instructions to run an experiment to instances one by one
        // Collect data? (nodes could push results to S3?)
        // Analyse data


    // Control experiment 1: layer 0 join times
        // 1. Results graphs for layer 0 join times
        // 2. Results graphs for layer 0 join times CDF
    // Control experiment 2: routing from node to node 
        // 1. Results graphs for routing from node to node
        // 2. Results graphs for routing from node to node CDF
    // Control experiment 3: time to data (storage, layer1 join, time to first neighbor, time to fist message)
        // 1. Results graphs for time to data
        // 2. Results graphs for time to data CDF
    // Control experiment 4: mean message propagation time
        // 1. Results graphs for mean message propagation time
        // 2. Results graphs for message propagation time CDF

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
                    } else if (message.payload.oneofKind === 'highMemoryAlarm') {
                        logger.warn('high memory alarm', { id: message.id, memoryUsage: message.payload.highMemoryAlarm.memoryUsage / 1024 / 1024 })
                    } else if (message.payload.oneofKind === 'getNeighborsResponse') {
                        this.topologyResult.set(message.id, message.payload.getNeighborsResponse.neighbors)
                    }
                })
            })
        })
        this.httpServer.listen(7070)
    }

    async waitForClients(onConditionFn?: () => void): Promise<void> {
        await until(() => { 
            if (onConditionFn !== undefined) {
                onConditionFn()
            }
            return this.clients.size === this.nodeCount 
        }, 20 * 60 * 1000, 10000)
        
    }

    async startEntryPoint(storeRoutingPaths = false, storeMessagePaths = false): Promise<string> {
        const entryPoint = sample(Array.from(this.clients.keys()))!
        const instruction = ExperimentServerMessage.create({
            instruction: {
                oneofKind: 'start',
                start: {
                    entryPoints: [],
                    asEntryPoint: true,
                    nodeId: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                    join: true,
                    storeRoutingPaths,
                    storeMessagePaths,
                    startWsServer: true
                }
            }
        })
        this.clients.get(entryPoint)!.socket.send(ExperimentServerMessage.toBinary(instruction))
        await until(() => this.clients.get(entryPoint)!.peerDescriptor !== undefined, 15000, 1000)
        return entryPoint
    }

    async startNodes(ratioOfWsNodes: number, entryPoint: string, join = true, storeRoutingPaths = false, storeMessagePaths = false): Promise<void> {
        logger.info('starting nodes')
        const entryPointPeerDescriptor = this.clients.get(entryPoint)!.peerDescriptor!
        const nodes = Array.from(this.clients.entries()).filter(([id]) => id !== entryPoint).map(([_, value]) => value)

        await this.runBatchedOperation(nodes, 10, async (node) => {
            const startWsServerForNode = Math.random() < ratioOfWsNodes
            const instruction = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'start',
                    start: {
                        entryPoints: [entryPointPeerDescriptor],
                        asEntryPoint: false,
                        join,
                        storeRoutingPaths,
                        storeMessagePaths,
                        startWsServer: startWsServerForNode
                    }
                }
            })
            node!.socket.send(ExperimentServerMessage.toBinary(instruction))
        }, (current) => current + 1 === Array.from(this.clients.values()).filter((node) => node.peerDescriptor !== undefined).length)
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
        await until(() => this.resultsReceived.size === this.nodeCount - 1, 30000, 1000)
    }

    async runRoutingExperiment(): Promise<void> {
        const nodes = Array.from(this.clients.values())
        await this.runBatchedOperation(nodes, 12, async (node) => {
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
        logger.info('Starting join stream part commands')
        this.instructionsCompleted = 0
        const nodes = shuffle(Array.from(this.clients.values()))
        await this.runBatchedOperation(nodes, 16, async (node) => {
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
        await until(() => this.instructionsCompleted === this.nodeCount, 5 * 60 * 1000, 1000)
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
        await this.runBatchedOperation(nodes, 6, async (node) => {
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }, (current) => current === this.instructionsCompleted)
        await until(() => this.instructionsCompleted === this.nodeCount, 30000, 1000)
    }

    async runTimeToDataExperiment(startWsServer: boolean, entryPoint: string): Promise<void> {
        const streamPartId = 'experiment#0'
        const publisher = sample(Array.from(this.clients.keys()).filter((id) => id !== entryPoint))!
        await this.startPublisher(publisher, streamPartId)
        const subsribers = Array.from(this.clients.keys()).filter((id) => id !== publisher)
        const suffled = shuffle(subsribers)
        let expectedSubscribers = 0
        const lastNodes: string[] = []
        for (const subscriber of suffled) {
            logger.info('Starting node for time to data measurement', { subscriber })
            const pickedEntryPoints = sampleSize(Array.from(this.clients.keys()).filter((id) => this.resultsReceived.has(id) && lastNodes.every((last) => last !== id) && this.clients.get(id)!.peerDescriptor!.websocket), 3)!
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'measureTimeToData',
                    measureTimeToData: {
                        streamPartId,
                        entryPoints: [
                            this.clients.get(entryPoint)!.peerDescriptor!,
                            ...pickedEntryPoints.map((entryPoint) => this.clients.get(entryPoint)!.peerDescriptor!)
                        ],
                        startWsServer
                    }
                }
            })
            this.clients.get(subscriber)!.socket.send(ExperimentServerMessage.toBinary(message))
            await wait(2500)
            if (lastNodes.length < 20) { 
                lastNodes.push(subscriber)
            } else {
                lastNodes.shift()
                lastNodes.push(subscriber)
            }
            expectedSubscribers += 1
        }
        await until(() => this.resultsReceived.size === expectedSubscribers, 1 * 60 * 1000, 1000)

    }

    async runScalingJoinExperiment(entryPoint: string): Promise<void> {
        const joinedNodes: string[] = []
        joinedNodes.push(entryPoint)
        const nodes = Array.from(this.clients.keys()).filter((id) => id !== entryPoint)
        for (const node of nodes) {
            logger.info('node joining', { node, joinedNodes: joinedNodes.length })
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
            await until(() => this.resultsReceived.has(node), 30000, 50)
            joinedNodes.push(node)
        }
    }

    async runPropagationExperiment(streamPartId: string): Promise<void> {
        const streamPart = StreamPartIDUtils.parse(streamPartId)
        await this.joinStreamPart(streamPart)
        const secondsToWait = 30
        logger.info('all nodes joined stream part waiting ' + secondsToWait + ' seconds for network to stabilize')
        await wait(secondsToWait * 1000)
        logger.info('Getting network topology')
        await this.getStreamTopology(streamPart)
        logger.info('Starting publishing')
        await this.publishMessage(streamPart)
        logger.info('all nodes published message')
        await this.pullPropagationResults(streamPart)      
    }

    async getStreamTopology(streamPartId: StreamPartID): Promise<void> {
        this.topologyResult.clear()
        const nodes = Array.from(this.clients.values())
        await Promise.all(nodes.map((node) => {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'getNeighborsRequest',
                    getNeighborsRequest: {
                        streamPartId: streamPartId.toString()
                    }
                }
            })
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }))
        await until(() => this.topologyResult.size === this.nodeCount, 10 * 60 * 1000, 100)
        const sumOfNeighbors = Array.from(this.topologyResult.values()).reduce((acc, neighbors) => acc + neighbors.length, 0)
        const averageNeighbors = sumOfNeighbors / this.nodeCount
        this.topologyResult.forEach((neighbors, id) => {
            writeResultsRow(this.topologyFilePath, JSON.stringify({ id, neighbors: neighbors.map((nodeId) => this.getExperimentNodeId(nodeId)) }))
        })
        logger.info('average number of neighbors', { averageNeighbors })
    }

    getExperimentNodeId(nodeId: string): string {
        const entry = Array.from(this.clients.entries()).find(([id, node]) => areEqualBinaries(hexToBinary(nodeId), node.peerDescriptor!.nodeId))
        return entry![0]
    }

    async startPublisher(publisher: string, streamPartId: string): Promise<void> {
        const message = ExperimentServerMessage.create({
            instruction: {
                oneofKind: 'publishOnInterval',
                publishOnInterval: {
                    streamPartId,
                    interval: 200
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
        await until(() => this.resultsReceived.size === this.nodeCount, 10 * 60 * 1000, 1000)
    }

    async stop(): Promise<void> {
        Array.from(this.clients.values()).map((client) => client.socket.close())
        this.httpServer!.close()
        this.wss!.close()
    }

    async stopNodes(): Promise<void> {
        const nodes = Array.from(this.clients.values())
        await Promise.all(nodes.map((node) => {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'stopNodeRequest',
                    stopNodeRequest: {
                    }
                }
            })
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }))
    }

    private async runBatchedOperation(nodes: ExperimentNode[], batchSize: number, operation: (node: ExperimentNode) => Promise<void>, untilCondition: (requiredCount: number) => boolean) {
        const batches = chunk(nodes, batchSize)
        for (let i in batches) {
            const batch = batches[i]
            await Promise.all(batch.map((node) => operation(node)))
            const instructedNodeCount = batch.length === batchSize ? batchSize * (parseInt(i) + 1) : batchSize * parseInt(i) + batch.length
            await until(() => untilCondition(instructedNodeCount), 2 * 60 * 1000, 1000)
            logger.info(`batch ${i} completed, ${nodes.length - instructedNodeCount} nodes remaining`)
        }
    }

    async runPingingExperiment(): Promise<void> {
        const nodes = Array.from(this.clients.values())
        await this.runBatchedOperation(nodes, 2, async (node) => {
            const message = ExperimentServerMessage.create({
                instruction: {
                    oneofKind: 'pingExperiment',
                    pingExperiment: {
                        ips: nodes.map((node) => node.ip!)
                    }
                }
            })
            node.socket.send(ExperimentServerMessage.toBinary(message))
        }, (current) => current === this.resultsReceived.size)
    }

    getIps(): Set<string> {
        return new Set(Array.from(this.clients.values()).map((node) => node.ip!))
    }

    hasIp(ip: string): boolean {
        return Array.from(this.clients.values()).some((node) => node.ip === ip)
    }

}
