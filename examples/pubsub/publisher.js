const { spawn } = require('child_process')

const child = spawn('node', ['../../bin/publisher.js'])

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
    console.log(chunk)
})
