const { spawn } = require('child_process')

const topic = 'tram-2'
const child = spawn('node', ['../../subscriber.js', '30304', '127.0.0.1', 'ws://127.0.0.1:30300', topic])

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
    console.log(chunk)
})
