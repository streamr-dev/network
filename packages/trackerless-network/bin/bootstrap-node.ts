import { ConnectionManager, DhtNode, PeerDescriptor, NodeType, PeerID } from '@streamr/dht'
import { StreamrNode, Event as StreamrNodeEvent } from '../src/logic/StreamrNode'
import {
    ContentMessage,
    MessageRef,
    StreamMessage,
    StreamMessageType
} from '../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { program } from 'commander'

program
    .option('--id <id>', 'Ethereum address / node id', 'bootstrap')
    .option('--name <name>', 'Name in published messages', 'bootstrap')
    .option('--streamIds <streamIds>', 'streamId to publish',  (value: string) => value.split(','), ['stream-0'])
    .option('--ip <ip>', 'Ip addres to use', '0.0.0.0')
    .option('--port <port>', 'Name in published messages', '23123')
    .description('Run bootstrap node')
    .parse(process.argv)

async function run(): Promise<void> {

    const streamPartId = 'stream#0'
    const ip = program.opts().ip
    const port = parseInt(program.opts().port)

    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString(program.opts().id).value,
        type: NodeType.NODEJS,
        websocket: { ip, port }
    }

    const layer0 = new DhtNode({ peerDescriptor: epPeerDescriptor, numberOfNodesPerKBucket: 8 })
    await layer0.start()
    await layer0.joinDht(epPeerDescriptor)

    const connectionManager = layer0.getTransport() as ConnectionManager
    const streamrNode = new StreamrNode()
    await streamrNode.start(layer0, connectionManager, connectionManager)

    await streamrNode.joinStream(streamPartId, epPeerDescriptor)
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
