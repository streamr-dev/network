import { StreamrClient } from './StreamrClient'

const STREAM_ID = '0x0472476943d7570b368e2a02123321518568a66e/yolo'

const streamrClient = new StreamrClient({
    auth: {
        privateKey: '0xf0e82cd2f354c60edcd2c23b40eb2fe8996397b096e47e3fc24d1e9c0a2c874a',
    },
    metrics: false,
    network: {
        controlLayer: {
            websocketPortRange: null
        }
    }
})

;(() => {
    let idx = 0
    setInterval(async () => {
        await streamrClient.publish(STREAM_ID, { idx: idx++ })
    }, 1000)
})()
