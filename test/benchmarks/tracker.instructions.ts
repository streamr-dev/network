/* eslint-disable no-console */
import path from 'path'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'

import { wait } from 'streamr-test-utils'

async function runNetwork(currentBenchmark: number, numberOfNodes: number, startingPort: number, timeout = 60 * 1000, trackerPort = 27777) {
    const productionEnv = Object.create(process.env)
    // productionEnv.DEBUG = 'streamr:*,-streamr:connection:*'
    productionEnv.checkUncaughtException = true

    const processes: ChildProcessWithoutNullStreams[] = []

    // create tracker
    const tracker = path.resolve('../../bin/tracker.js')
    let args = [
        tracker,
        '--port=' + trackerPort,
        '--metrics=true',
        '--metricsInterval=1000'
    ]

    const trackerProcess = spawn('node', args, {
        env: productionEnv
    })

    let metrics = null

    trackerProcess.stdout.on('data', (data) => {
        try {
            metrics = JSON.parse(data.toString())
        } catch (e) {
            //
        }
    })

    processes.push(trackerProcess)

    for (let j = 0; j < numberOfNodes; j++) {
        args = [
            path.resolve('../../bin/subscriber.js'),
            '--streamId=streamId-1',
            '--port=' + (startingPort + j),
            `--trackers=ws://127.0.0.1:${trackerPort}`
        ]

        const subscriber = spawn('node', args, {
            env: productionEnv,
            // stdio: [process.stdin, process.stdout, process.stderr]
        })

        processes.push(subscriber)
    }

    await wait(timeout)
    console.info(`Stopping benchmark ${currentBenchmark}`)
    processes.forEach((child) => child.kill())
    return metrics
}

interface Benchmark {
    sendInstruction: any
    memory: any
}

function extractMetrics(metrics: any): Benchmark {
    return {
        sendInstruction: metrics.trackerMetrics.metrics.sendInstruction,
        memory: metrics.processMetrics.memory
    }
}

const arrMax = (arr: number[]) => Math.max(...arr)
const arrMin = (arr: number[]) => Math.min(...arr)
const arrAvg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
const arrayColumn = (arr: any, n: string) => arr.map((x: any) => x[n])

async function run(numberOfBenchmarks = 10, numberOfNodes = 100, timeout = 60 * 1000) {
    const benchmarks: Benchmark[] = []
    console.info('Starting benchmark')
    for (let i = 0; i < numberOfBenchmarks; i++) {
        console.info(`\nRunning benchmark ${i}`)
        // eslint-disable-next-line no-await-in-loop
        const metrics = await runNetwork(i, numberOfNodes, 30400, timeout)
        benchmarks.push(extractMetrics(metrics))
    }
    console.info('benchmark stopped\n')
    console.info(`\n\nResults for ${numberOfBenchmarks} iterations, running ${numberOfNodes} nodes`)

    const keys = ['sendInstruction', 'memory']
    keys.forEach((key) => {
        const values = arrayColumn(benchmarks, key)
        console.info(`${key} => min: ${arrMin(values)}, max: ${arrMax(values)}, avg: ${arrAvg(values)}`)
    })
}

run(10, 2, 60 * 1000)

