const { startTracker } = require('./src/composition')

const port = process.argv[2] || 30300

startTracker('127.0.0.1', port, 'tracker' + port)
    .then(() => {})
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
