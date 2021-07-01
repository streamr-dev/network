import {
    startNetworkNode,
    Protocol,
    NetworkNode
} from "streamr-network"

/**
 * Run a subscriber node that subscribes to stream "system-report" and logs all received messages in stdout.
 */
async function runSubscriber(id: string): Promise<NetworkNode> {
    const subscriberNode: NetworkNode = await startNetworkNode({
        name: id,
        trackers: ['ws://127.0.0.1:30300']
    })
    subscriberNode.start()
    subscriberNode.subscribe('system-report', 0)
    subscriberNode.addMessageListener((msg: Protocol.MessageLayer.StreamMessage) => {
        const msgAsJson = JSON.stringify(msg.getContent(), null, 2)
        console.info(`${id} received ${msgAsJson}`)
    })
    return subscriberNode
}

async function main(): Promise<void> {
    let count = 0
    let maxTries = 20
    let nodeRunning = false

    while(!nodeRunning) {
        try {
            await runSubscriber(`subscriberNode ${count}`)
            nodeRunning = true
        } catch (e) {
            if (++count == maxTries) throw e;
        }
    }
}
main().catch((err) => console.error(err))