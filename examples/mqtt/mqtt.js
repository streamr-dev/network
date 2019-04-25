const mqtt = require('mqtt')
const { startStorageNode } = require('../../src/composition')

const port = process.argv[2] || 40300
const ip = process.argv[3] || '127.0.0.1'
const trackers = process.argv[4] ? process.argv[4].split(',') : ['ws://127.0.0.1:30300']
const mqttUrl = process.argv[5] || 'mqtts://mqtt.hsl.fi:8883'
const mqttTopic = process.argv[6] || '/hfp/v1/journey/ongoing/tram/#'
const id = `mqtt-${port}`

startStorageNode(ip, port, id)
    .then((mqttNode) => {
        trackers.map((trackerAddress) => mqttNode.addBootstrapTracker(trackerAddress))

        const client = mqtt.connect(mqttUrl)
        client.on('connect', () => {
            client.subscribe(mqttTopic)
            console.log('Connected')
        })

        client.on('message', (topic, message) => {
            const data = JSON.parse(message)

            if (data.VP.desi) {
                const streamId = 'tram-' + data.VP.desi

                mqttNode.subscribe(streamId, 0)
                mqttNode.publish(streamId, 0, new Date(data.VP.tst).getTime() / 1000, 0, id, '', null, null, data, '', 0)

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

