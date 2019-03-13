const { spawn } = require('child_process')
const path = require('path')

const numberOfNodes = process.argv[2] || 0
const startingPort = 30400

const productionEnv = Object.create(process.env)
productionEnv.DEBUG = 'streamr:*'
productionEnv.checkUncaughtException = true

// create tracker
spawn('node', [path.join(__dirname, '/tracker.js')], {
    env: productionEnv,
    stdio: [process.stdin, process.stdout, process.stderr]
})

for (let i = 0; i < numberOfNodes; i++) {
    spawn('node', [path.join(__dirname, '/subscriber.js'), startingPort + i], {
        env: productionEnv,
        stdio: [process.stdin, process.stdout, process.stderr]
    })
}
