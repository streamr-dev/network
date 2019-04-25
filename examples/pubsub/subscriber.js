const { spawn } = require('child_process')

const topic = 'tram-2'
const child = spawn('node', ['../../bin/subscriber.js'])

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
    console.log(chunk)
})
