import { StreamrClient } from './StreamrClient'
import { StreamPartIDUtils } from '@streamr/protocol'
import { getNodeIdFromPeerDescriptor, ConnectionManager, PeerDescriptor } from '@streamr/dht'

const main = async () => {
    let numOfMessagesPerTenSeconds = 0
    let numOfMessagesPerMinute = 0
    let networkNumOfMessagesPerTenSeconds = 0
    let networkNumOfMessagesPerMinute = 0

    const client = new StreamrClient({
        // environment: "mumbai",
        metrics: false,
        contracts: {
            streamRegistryChainRPCs: {
                chainId: 137,
                name: 'polygon',
                rpcs: [
                    {
                        "url": "https://polygon-rpc.com"
                    },
                    {
                        "url": "https://polygon.gateway.tenderly.co"
                    }
                ]

            }
        }
    })

    const streamParts = [
        StreamPartIDUtils.parse('streams.dimo.eth/firehose/weather#0'),
        StreamPartIDUtils.parse('streams.dimo.eth/firehose/weather#1'),
        StreamPartIDUtils.parse('streams.dimo.eth/firehose/weather#2'),
        StreamPartIDUtils.parse('eth-watch.eth/ethereum/blocks#0'),
        StreamPartIDUtils.parse('0xbafb06e3d7546742c6b1f2945b74ce0b3edc201a/nodle#0'),
        StreamPartIDUtils.parse('streamr.eth/demos/helsinki-trams#0'),
        StreamPartIDUtils.parse('0x7277c78c02a4192ef8c48f5f4c529278d0e447fc/kyve/kyve-1/0#0'),
        StreamPartIDUtils.parse('streamr.eth/demos/video#0'),
        StreamPartIDUtils.parse('eth-watch.eth/ethereum/events#0'),
        StreamPartIDUtils.parse('eth-watch.eth/ethereum/events#1'),
        StreamPartIDUtils.parse('eth-watch.eth/ethereum/events#2'),
        StreamPartIDUtils.parse('eth-watch.eth/ethereum/events#3'),
        StreamPartIDUtils.parse('eth-watch.eth/ethereum/events#4'),
        StreamPartIDUtils.parse('binance-streamr.eth/DATAUSDT/trades#0'),
        StreamPartIDUtils.parse('binance-streamr.eth/DATAUSDT/ticker#0'),
        StreamPartIDUtils.parse('0xd37dc4d7e2c1bdf3edd89db0e505394ea69af43d/gas-station/polygon#0'),
    ]

    setInterval(() => {
        console.log('Num of messages in the last ten seconds ' + numOfMessagesPerTenSeconds + ' (network): ' + networkNumOfMessagesPerTenSeconds)
        numOfMessagesPerTenSeconds = 0
        networkNumOfMessagesPerTenSeconds = 0
    }, 10000)

    setInterval(() => {
        console.log('Num of messages in the last minute ' + numOfMessagesPerMinute + ' (network): ' + networkNumOfMessagesPerMinute)
        numOfMessagesPerMinute = 0
        networkNumOfMessagesPerMinute = 0
    }, 60000)

    setInterval(async () => {
        const node = await client.getNode()
        // @ts-expect-error private
        const cmConnections = (node.stack.getLayer0Node().getTransport() as ConnectionManager).getConnections()
        console.log('total connections (CM): ' + cmConnections.length)
        // @ts-expect-error private
        const dhtConnections =  (node.stack.getLayer0Node() as DhtNode).getConnectionsView().getConnections()
        console.log('total connections: (DHTNODE)' + dhtConnections.length)
        if (cmConnections.length !== dhtConnections.length) {
            console.error('FATAL: connections mismatch')
            const badConnections = cmConnections.filter((cmConnection) => {
                const nodeId = getNodeIdFromPeerDescriptor(cmConnection)
                return !dhtConnections.some((dhtConnection: PeerDescriptor) => getNodeIdFromPeerDescriptor(dhtConnection) === nodeId)
            })
            badConnections.forEach((badConnection) => {
                console.log(getNodeIdFromPeerDescriptor(badConnection))
                // @ts-expect-error private
                console.log((node.stack.getLayer0Node().getTransport() as ConnectionManager).getConnection(getNodeIdFromPeerDescriptor(badConnection)))
            })
            badConnections.forEach((badConnection) => {
                console.log(badConnection)
            })
        }
        streamParts.forEach((stream) => {
            console.log('total stream neighbors on ' + stream.toString() + ': ' + node.getNeighbors(stream).length)
        })

    }, 5000)

    for (const streamPart of streamParts) {
        const sub = await client.subscribe(streamPart, () => {
            numOfMessagesPerTenSeconds += 1
            numOfMessagesPerMinute += 1
        })
        sub.on('error', (err) => {
            console.log(err)
        })
    }
    const node = await client.getNode()
    // @ts-expect-error private
    node.stack.contentDeliveryManager.on('newMessage', (msg) => {
        if (msg.body.oneofKind === 'contentMessage') {
            networkNumOfMessagesPerTenSeconds += 1
            networkNumOfMessagesPerMinute += 1
        }
    })
    
}

main().catch((err) => console.error(err))
