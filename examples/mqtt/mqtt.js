const mqtt = require('mqtt')
const { startNetworkNode } = require('../../src/composition')
const { MessageLayer } = require('streamr-client-protocol')
const { StreamMessage } = MessageLayer

const port = process.argv[2] || 40300
const ip = process.argv[3] || '127.0.0.1'
const trackers = process.argv[4] ? process.argv[4].split(',') : ['ws://127.0.0.1:30300']
const mqttUrl = process.argv[5] || 'mqtts://mqtt.hsl.fi:8883'
const mqttTopic = process.argv[6] || "/hfp/v2/journey/ongoing/vp/tram/#"
const id = `mqtt-${port}`
const streamId = 'default-stream-id'

startNetworkNode(ip, port, id)
    .then((mqttNode) => {
        trackers.map((trackerAddress) => mqttNode.addBootstrapTracker(trackerAddress))

        mqttNode.subscribe(streamId, 0)

        const client = mqtt.connect(mqttUrl)
        client.on('connect', () => {
            client.subscribe(mqttTopic)
            console.log('Connected')
        })

        let lastTimestamp = null
        let sequenceNumber = 0

        client.on('message', (topic, message) => {
            const data = JSON.parse(message)

            if (data.VP.desi) {
                const timestamp = Date.now()
                const streamMessage = StreamMessage.create(
                    [streamId, 0, timestamp, sequenceNumber, id, streamId],
                    lastTimestamp == null ? null : [lastTimestamp, sequenceNumber - 1],
                    StreamMessage.CONTENT_TYPES.MESSAGE,
                    StreamMessage.ENCRYPTION_TYPES.NONE,
                    {
                        data
                    },
                    StreamMessage.SIGNATURE_TYPES.NONE,
                    null
                )
                mqttNode.publish(streamMessage)

                console.log('---')
                console.log(topic)
                console.log(streamId)
                console.log(JSON.stringify(JSON.parse(message), null, 4))
            }
        })
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })

