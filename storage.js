const { startStorageNode } = require('./src/composition')

const port = process.argv[2] || 40300
const ip = process.argv[3] || '127.0.0.1'
const trackers = process.argv[4] ? process.argv[4].split(',') : ['ws://127.0.0.1:30300']
const id = `storage-${port}`

startStorageNode(ip, port, id)
    .then((storage) => {
        trackers.map((trackerAddress) => storage.addBootstrapTracker(trackerAddress))
    })
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })

