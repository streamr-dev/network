import { StreamrClient } from './StreamrClient'
import { StreamPartIDUtils } from '@streamr/protocol'

const main = async () => {
    let numOfMessagesPerTenSeconds = 0
    let numOfMessagesPerMinute = 0
    const client = new StreamrClient({
        // environment: "mumbai",
        metrics: false
    })

    setInterval(() => {
        console.log('Num of messages in the last ten seconds ' + numOfMessagesPerTenSeconds)
        numOfMessagesPerTenSeconds = 0
    }, 10000)

    setInterval(() => {
        console.log('Num of messages in the last minute ' + numOfMessagesPerMinute)
        numOfMessagesPerMinute = 0
    }, 60000)

    setInterval(async () => {
        const node = await client.getNode()
        // @ts-expect-error private
        console.log('total connections (CM): ' + (node.stack.getLayer0Node().getTransport() as ConnectionManager).getAllConnectionPeerDescriptors().length)
        // @ts-expect-error private
        console.log('total connections: (DHTNODE)' + (node.stack.getLayer0Node() as DhtNode).getNumberOfConnections())
        const stream1 = StreamPartIDUtils.parse('streams.dimo.eth/firehose/weather#0')
        console.log('total stream neighbors on streams.dimo.eth/firehose/weather: ' + node.getNeighbors(stream1).length)
        const stream2 = StreamPartIDUtils.parse('eth-watch.eth/ethereum/blocks#0')
        console.log('total stream neighbors on eth-watch.eth/ethereum/blocks: ' + node.getNeighbors(stream2).length)
        const stream3 = StreamPartIDUtils.parse('streamr.eth/demos/helsinki-trams#0')
        console.log('total stream neighbors on streamr.eth/demos/helsinki-trams: ' + node.getNeighbors(stream3).length)
        const stream4 = StreamPartIDUtils.parse('0xbafb06e3d7546742c6b1f2945b74ce0b3edc201a/nodle#0')
        console.log('total stream neighbors on 0xbafb06e3d7546742c6b1f2945b74ce0b3edc201a/nodle: ' + node.getNeighbors(stream4).length)
        const stream5 = StreamPartIDUtils.parse('0x7277c78c02a4192ef8c48f5f4c529278d0e447fc/kyve/kyve-1/0#0')
        console.log('total stream neighbors on 0x7277c78c02a4192ef8c48f5f4c529278d0e447fc/kyve/kyve-1/0: ' + node.getNeighbors(stream5).length)
        const stream6 = StreamPartIDUtils.parse('streamr.eth/demos/video#0')
        console.log('total stream neighbors on streamr.eth/demos/video: ' + node.getNeighbors(stream6).length)
    }, 10000)

    await client.subscribe({
        streamId: "streams.dimo.eth/firehose/weather",
        partition: 0
    }, () => {
        numOfMessagesPerTenSeconds += 1
        numOfMessagesPerMinute += 1
    })
    await client.subscribe({
        streamId: "streams.dimo.eth/firehose/weather",
        partition: 1
    }, () => {
        numOfMessagesPerTenSeconds += 1
        numOfMessagesPerMinute += 1
    })
    await client.subscribe({
        streamId: "streams.dimo.eth/firehose/weather",
        partition: 2
    }, () => {
        numOfMessagesPerTenSeconds += 1
        numOfMessagesPerMinute += 1
    })
    await client.subscribe({
        streamId: "eth-watch.eth/ethereum/blocks",
        partition: 0
    }, () => {
        numOfMessagesPerTenSeconds += 1
        numOfMessagesPerMinute += 1
    })
    await client.subscribe({
        streamId: "0xbafb06e3d7546742c6b1f2945b74ce0b3edc201a/nodle",
        partition: 0
    }, () => {
        numOfMessagesPerTenSeconds += 1
        numOfMessagesPerMinute += 1
    })
    await client.subscribe({
        streamId: "streamr.eth/demos/helsinki-trams",
        partition: 0
    }, () => {
        numOfMessagesPerTenSeconds += 1
        numOfMessagesPerMinute += 1
    })
    await client.subscribe({
        streamId: "0x7277c78c02a4192ef8c48f5f4c529278d0e447fc/kyve/kyve-1/0",
        partition: 0
    }, () => {
        numOfMessagesPerTenSeconds += 1
        numOfMessagesPerMinute += 1
    })
    await client.subscribe({
        streamId: "streamr.eth/demos/video",
        partition: 0
    }, () => {
        numOfMessagesPerTenSeconds += 1
        numOfMessagesPerMinute += 1
    })
    // await client.subscribe({
    //     streamId: "0x80da975ba0978d8df26b5ab3c2758a00d7ee298a/operator/coordination",
    //     partition: 0
    // }, () => {
    //     numOfMessagesPerTenSeconds += 1
    //     numOfMessagesPerMinute += 1
    // })

    // await client.subscribe({
    //     streamId: "0x6ee2d67541640f62ff44d5b1b417255437ed36cd/operator/coordination",
    //     partition: 0
    // }, () => {
    //     numOfMessagesPerTenSeconds += 1
    //     numOfMessagesPerMinute += 1
    // })
}

main().catch((err) => console.error(err))
