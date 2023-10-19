import { DhtNode } from './DhtNode'

const main = async () => {
    const node = new DhtNode({
        websocketPortRange: { min: 30000, max: 30000 },
        websocketServerEnableTls: false,
        entryPoints: [],
        websocketHost: '65.108.158.160',
        peerId: 'e2'
    })
    await node.start()
}

main()

