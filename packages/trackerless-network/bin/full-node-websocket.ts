import { ConnectionManager, DhtNode, NodeType, PeerDescriptor, PeerID } from '@streamr/dht'
import { Event as StreamrNodeEvent, StreamrNode } from '../src/logic/StreamrNode'
import {
    ContentMessage,
    MessageRef,
    StreamMessage,
    StreamMessageType
} from '../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { program } from 'commander'

program
    .option('--id <id>', 'Ethereum address / node id', 'full-node')
    .option('--name <name>', 'Name in published messages', 'full-node')
    .option('--ip <ip>', 'Ip address to use', '0.0.0.0')
    .option('--wsPort <port>', 'Name in published messages', '23124')
    .option('--entrypointId <entrypointId>', 'Entrypoints stringId', 'bootstrap')
    .option('--entrypointIp <entrypointIp>', 'Entrypoints IP address', '0.0.0.0')
    .option('--streamIds <streamIds>', 'streamId to publish',  (value: string) => value.split(','), ['stream-0'])
    .description('Run full node')
    .parse(process.argv)

async function run(): Promise<void> {

    const streamPartId = 'stream#0'
    const port = parseInt(program.opts().wsPort, 10)
    const ip = program.opts().ip

    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString(program.opts().entrypointId).value,
        type: NodeType.NODEJS,
        websocket: { ip: program.opts().entrypointIp, port: 23123 }
    }

    const layer0 = new DhtNode({ webSocketPort: port, webSocketHost: ip, peerIdString: program.opts().id })
    await layer0.start()

    await layer0.joinDht(epPeerDescriptor)

    const connectionManager = layer0.getTransport() as ConnectionManager
    const streamrNode = new StreamrNode()
    await streamrNode.start(layer0, connectionManager, connectionManager)

    streamrNode.subscribeToStream(streamPartId, epPeerDescriptor)

    streamrNode.on(StreamrNodeEvent.NEW_MESSAGE, (msg: StreamMessage) => {
        // eslint-disable-next-line no-console
        console.log(`new message received: ${JSON.parse(ContentMessage.fromBinary(msg.content).body).hello}`)
    })

    let sequenceNumber = 0
    setInterval(() => {
        const messageRef: MessageRef = {
            sequenceNumber,
            timestamp: BigInt(Date.now()),
            publisherId: PeerID.fromValue(layer0.getPeerDescriptor().peerId).toString(),
            streamPartition: 0,
            streamId: streamPartId,
            messageChainId: 'network'
        }

        const content: ContentMessage = {
            body: JSON.stringify({ hello: `from ${program.opts().name }` })
        }
        const message: StreamMessage = {
            content: ContentMessage.toBinary(content),
            messageRef,
            messageType: StreamMessageType.MESSAGE,
            signature: 'signature'
        }
        streamrNode.publishToStream(streamPartId, epPeerDescriptor, message)
        sequenceNumber++
    }, 10000)
}

run()
