#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { fork } = require('child_process')
const chalk = require('chalk')
const { Transform } = require('stream')
const { Logger, wait } = require('@streamr/utils')

const processes = new Map()

const killProcesses = () => {
    processes.forEach((p) => {
        if (!p.killed) {
            p.kill()
        }
    })
}

const createCollectLineTransform = () => {
    let prevMsg = ''
    return new Transform({
        transform: (buf, _encoding, done) => {
            const msg = buf.toString()
            if (msg.endsWith('\n')) {
                const fullMsg = prevMsg + msg
                done(null, fullMsg)
                prevMsg = ''
            } else {
                prevMsg = msg
                done()
            }
        }
    })
}

const createColorizeTransform = (defaultColor) => {
    const getLevelColor = (id) => {
        if (id === 'ERROR') {
            return chalk.hex('#FF0000')
        } else if (id === 'WARN') {
            return chalk.hex('#FFFF00')
        } else {
            return undefined
        }
    }
    const META_PATTERN = new RegExp(`^(ERROR|WARN|INFO|DEBUG|TRACE) \\[(.{23})\\] \\((.{${Logger.NAME_LENGTH}})\\):`)
    return new Transform({
        transform: (buf, _encoding, done) => {
            const msg = buf.toString()
            const lines = msg.split('\n').map((line) => {
                const groups = line.match(META_PATTERN)
                if (groups !== null) {
                    const match = groups[0]
                    const level = groups[1]
                    const time = groups[2]
                    const name = groups[3]
                    const levelColor = getLevelColor(level)
                    const metaPrefix = `${level.substring(0, 1)} ${time}   ${name}  `
                    const msg = line.substring(match.length)
                    if (levelColor !== undefined) {
                        return levelColor(`${metaPrefix}${msg}`)
                    } else {
                        return `${defaultColor(metaPrefix)}${msg}`
                    }
                } else {
                    return line
                }
            })
            done(null, lines.join('\n'))
        }
    })
}

const pipeOutputStreams = (p, defaultColor) => {
    p.stdout
        .pipe(createCollectLineTransform())
        .pipe(createColorizeTransform(defaultColor))
        .pipe(process.stdout)
    p.stderr
        .pipe(process.stderr)
}

const getProcessLogLevel = (processName) => {
    const key = `LOG_LEVEL_${processName}`
    return process.env[key] || process.env.LOG_LEVEL
}

const forkProcess = (processName, filePath, args, color) => {
    const p = fork(filePath, args, {
        silent: true,
        env: {
            STREAMR_APPLICATION_ID: processName,
            LOG_LEVEL: getProcessLogLevel(processName),
            LOG_COLORS: 'false'
        }
    })
    processes.set(processName, p)
    pipeOutputStreams(p, color)
    p.on('close', () => {
        killProcesses()
    })
}

const brokerBin = './broker.js'
forkProcess('S1', brokerBin, ['../configs/development-1.env.json'], chalk.hex('#8888FF')) // 0xde1112f631486CfC759A50196853011528bC5FA0
forkProcess('B1', brokerBin, ['../configs/development-2.env.json'], chalk.hex('#0088FF')) // 0xde222E8603FCf641F928E5F66a0CBf4de70d5352
forkProcess('B2', brokerBin, ['../configs/development-3.env.json'], chalk.hex('#88CCFF')) // 0xde3331cA6B8B636E0b82Bf08E941F727B8927442
