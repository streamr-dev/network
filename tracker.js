const { startTracker } = require('./src/composition')

const port = process.argv[2] || 30300
const ip = process.argv[3] || '127.0.0.1'

startTracker(ip, port, 'tracker' + port)
    .then(() => {})
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
