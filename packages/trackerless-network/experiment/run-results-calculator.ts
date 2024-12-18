const fs = require('fs')
const path = require('path')
const { promisify } = require('util')

import { writeResultsRow } from "./ExperimentController"
import { joinResults, propagationResults, routingResults, timeToDataResults } from "./ResultCalculator"

const modes = [ 'propagation', 'join', 'routing', 'timetodata' ]

const rootDirectory = process.argv[2]
const experiment = process.argv[3]

if (rootDirectory === undefined) {
    throw new Error('root directory must be provided')
}

if (experiment === undefined || !modes.includes(experiment)) {
    throw new Error('experiment must be provided')
}

const run = async (): Promise<void> => {

    const readdir = promisify(fs.readdir)
    
    const processedFilePath = path.join(rootDirectory, 'processed.csv')
    const nodeCountDirectories = await readdir(rootDirectory)
    const processedResults: Map<string, Map<string, unknown>> = new Map()
    for (const nodeCountDirectory of nodeCountDirectories) {
        const nodeCountDirectoryPath = path.join(rootDirectory, nodeCountDirectory)
        const results = await readdir(nodeCountDirectoryPath)
        processedResults.set(nodeCountDirectory, new Map())
        for (const result of results) {
            const filePath = path.join(rootDirectory, nodeCountDirectory, result)
            let parsed: unknown
            if (experiment === 'propagation') {
                parsed = await propagationResults(filePath)
            } else if (experiment === 'join') {
                parsed = await joinResults(filePath)
            } else if (experiment === 'routing') {
                parsed = await routingResults(filePath)
            } else if (experiment === 'timetodata') {
                parsed = await timeToDataResults(filePath)
            }
            processedResults.get(nodeCountDirectory)!.set(result, parsed)
        }
    }
    if (experiment === 'propagation') {
        writeResultsRow(processedFilePath, `nodes, run, propagationTime, hops, messagesReceived, maxHops, maxPropagationTime`)
        processedResults.forEach((value, key) => {
            const nodeCount = key.split('-')[2]
            value.forEach((innerValue: any, innerKey) => {
                const run = innerKey.split('.')[0]
                writeResultsRow(processedFilePath, `${nodeCount}, ${run}, ${innerValue.propagationTime}, ${innerValue.hops}, ${innerValue.messagesReceived}, ${innerValue.maxHops}, ${innerValue.maxPropagationTime}`)
            })
        })
    } else if (experiment === 'join') {
        writeResultsRow(processedFilePath, 'nodeCount, time')
        processedResults.forEach((value, _key) => {
            value.forEach((innerValue: any, _innerKey) => {
                innerValue.forEach((line: any) => {
                    writeResultsRow(processedFilePath, `${line.nodeCount}, ${line.time}`)
                })
            })
        })
    } else if (experiment === 'routing') {
        writeResultsRow(processedFilePath, `nodes, run, avgRtt, avgTimeToReceiver, avgTimeToRequestor, avgHop`)
        processedResults.forEach((value, key) => {
            const nodeCount = key.split('-')[2]
            value.forEach((innerValue: any, innerKey) => {
                const run = innerKey.split('.')[0]
                writeResultsRow(processedFilePath, `${nodeCount}, ${run}, ${innerValue.rtt}, ${innerValue.timeToReceiver}, ${innerValue.timeToRequestor}, ${innerValue.hop}`)
            })
        })
    } else if (experiment === 'timetodata') {

    }


}

run()
