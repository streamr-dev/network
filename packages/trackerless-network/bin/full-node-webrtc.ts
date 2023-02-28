import { ConnectionManager, DhtNode, PeerDescriptor, NodeType, PeerID } from '@streamr/dht'
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
    .option('--wsPort <wsPort>', 'port for ws server', '23124')
    .option('--entrypointId <entrypointId>', 'Entrypoints stringId', 'bootstrap')
    .option('--entrypointIp <entrypointIp>', 'Entrypoints IP address', '0.0.0.0')
    .option('--streamIds <streamIds>', 'streamId to publish', (value: string) => value.split(','), ['stream-0'])
    .description('Run full node')
    .parse(process.argv)

async function run(): Promise<void> {

    const streamPartId = 'stream#0'

    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(program.opts().entrypointId).value,
        type: NodeType.NODEJS,
        websocket: { ip: program.opts().entrypointIp, port: 23123 }
    }

    const peerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(program.opts().id).value,
        type: NodeType.NODEJS
    }
    const layer0 = new DhtNode({
        peerDescriptor,
        numberOfNodesPerKBucket: 2,
        rpcRequestTimeout: 15000,
        stunUrls: ['stun:stun.l.google.com:19302', 'turn:BrubeckTurn1:MIlbgtMw4nhpmbgqRrht1Q==@turn.streamr.network:5349'],
        entryPoints: [epPeerDescriptor]
    })
    await layer0.start()

    await layer0.joinDht(epPeerDescriptor)

    const connectionManager = layer0.getTransport() as ConnectionManager
    const streamrNode = new StreamrNode({})
    await streamrNode.start(layer0, connectionManager, connectionManager)

    streamrNode.subscribeToStream(streamPartId, epPeerDescriptor)

    streamrNode.on(StreamrNodeEvent.NEW_MESSAGE, (msg: StreamMessage) => {
        // eslint-disable-next-line no-console
        console.log(`new message received: ${JSON.parse(ContentMessage.fromBinary(msg.content).body).hello}`)
    })

    let sequenceNumber = 0
    setInterval(() => {
        // eslint-disable-next-line no-console
        console.log(
            `Number of connected stream neighbors ${streamrNode.getStream(streamPartId)?.layer2.getTargetNeighborStringIds().length || 0}, `
            + `targets: ${streamrNode.getStream(streamPartId)?.layer2.getTargetNeighborStringIds() || []}`
        )
        // eslint-disable-next-line no-console
        console.log(
            `Layer2: Nearby Contacts ${streamrNode.getStream(streamPartId)?.layer2.getNearbyContactPoolIds().length || 0}, `,
            `Random Contacts ${streamrNode.getStream(streamPartId)?.layer2.getRandomContactPoolIds().length || 0}, `
        )
        // eslint-disable-next-line no-console
        console.log(
            `Layer1: Kbucket size ${streamrNode.getStream(streamPartId)?.layer1.getBucketSize() || 0} `,
            `DHT contacts ${streamrNode.getStream(streamPartId)?.layer1.getNeighborList().getSize() || 0} `,
        )
        // eslint-disable-next-line no-console
        console.log(
            `Layer0: Kbucket size ${layer0.getBucketSize() || 0} `,
            `DHT contacts ${layer0.getNeighborList().getSize() || 0}`
        )
        const messageRef: MessageRef = {
            sequenceNumber,
            timestamp: BigInt(Date.now()),
            publisherId: PeerID.fromValue(layer0.getPeerDescriptor().kademliaId).toString(),
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
