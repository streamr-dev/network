const { startTracker } = require('./src/composition')

const port = process.argv[2] || 30300
const ip = process.argv[3] || '127.0.0.1'
const id = `tracker-${port}`
const maxNeighborsPerNode = 4

startTracker(ip, port, id, maxNeighborsPerNode)
    .then(() => {})
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })

if (process.env.checkUncaughtException === 'true') {
    process.on('uncaughtException', (err) => console.error((err && err.stack) ? err.stack : err))
}
