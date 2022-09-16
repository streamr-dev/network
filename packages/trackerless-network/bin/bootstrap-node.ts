import { ConnectionManager, DhtNode, PeerDescriptor, NodeType } from '@streamr/dht'
import { StreamrNode, Event as StreamrNodeEvent } from '../src/logic/StreamrNode'
import { DataMessage, MessageRef } from '../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { PeerID } from '@streamr/dht/dist/src'
import { program } from 'commander'

program
    .option('--id <id>', 'Ethereum address / node id', 'bootstrap')
    .option('--name <name>', 'Name in published messages', 'bootstrap')
    .option('--streamIds <streamIds>', 'streamId to publish',  (value: string) => value.split(','), ['stream-0'])
    .description('Run bootstrap node')
    .parse(process.argv)

async function run(): Promise<void> {

    const streamPartId = 'stream#0'

    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString(program.opts().id).value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 23123 }
    }

    const layer0 = new DhtNode({ peerDescriptor: epPeerDescriptor })
    await layer0.start()
    await layer0.joinDht(epPeerDescriptor)

    const connectionManager = layer0.getTransport() as ConnectionManager
    const streamrNode = new StreamrNode()
    await streamrNode.start(layer0, connectionManager, connectionManager)

    await streamrNode.joinStream(streamPartId, epPeerDescriptor)
    streamrNode.subscribeToStream(streamPartId, epPeerDescriptor)

    streamrNode.on(StreamrNodeEvent.NEW_MESSAGE, (msg: DataMessage, _nodeId: string) => {
        // eslint-disable-next-line no-console
        console.log(`new message received: ${JSON.parse(msg.content).hello}`)
    })

    let sequenceNumber = 0
    setInterval(() => {
        const messageRef: MessageRef = {
            sequenceNumber,
            timestamp: BigInt(Date.now())
        }
        const message: DataMessage = {
            content: JSON.stringify({ hello: `from ${program.opts().name}`  }),
            senderId: PeerID.fromValue(layer0.getPeerDescriptor().peerId).toString(),
            messageRef,
            streamPartId
        }
        streamrNode.publishToStream(streamPartId, epPeerDescriptor, message)
        sequenceNumber++
    }, 5000)
}

run()
