import { waitForEvent } from '@streamr/utils'
import fs from 'fs'
const readline = require('readline')

export const joinResults = async (filePath: string): Promise<unknown> => {
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let sum = 0
    let numOfLines = 0
    file.on('line', (line: string) => {
        const results = JSON.parse(line)
        sum += parseInt(results.results)
        numOfLines += 1
    })
    await waitForEvent(file, 'close')
    console.log('avg:', sum / numOfLines)
    return { avg: sum / numOfLines }
}

export const routingResults = async (filePath: string): Promise<unknown> => {
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let rttSum = 0
    let hopSum = 0
    let timeToReceiverSum = 0
    let timeToRequestorSum = 0
    let numOfLines = 0
    file.on('line', (line: string) => {
        const parsedLine = JSON.parse(line)
        const id = parsedLine.id
        const results = JSON.parse(parsedLine.results)
        for (const result of results) {
            rttSum += result.rtt
            timeToReceiverSum += result.timeToReceiver
            timeToRequestorSum += result.timeToRequestor
            hopSum += result.path.length
            numOfLines += 1
        }
    })
    await waitForEvent(file, 'close')

    const avgRtt = rttSum / numOfLines
    const avgTimeToReceiver = timeToReceiverSum / numOfLines
    const avgTimeToRequestor = timeToRequestorSum / numOfLines
    const avgHop = hopSum / numOfLines

    console.log('rtt avg:', avgRtt)
    console.log('time to receiver avg:', avgTimeToReceiver)
    console.log('time to requestor avg:', avgTimeToRequestor)
    console.log('hop avg:', avgHop)

    return { rtt: avgRtt, timeToReceiver: avgTimeToReceiver, timeToRequestor: avgTimeToRequestor, hop: avgHop }
}

export const timeToDataResults = async (filePath: string): Promise<unknown> => {
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let sumTimeToData = 0
    let sumLayer1Join = 0
    let sumEntryPointFetch = 0
    let numOfLines = 0
    file.on('line', (line: string) => {
        const parsedLine = JSON.parse(line)
        const parsedResult = JSON.parse(parsedLine.results)
        sumTimeToData += parsedResult.messageReceivedTimestamp - parsedResult.startTime
        sumLayer1Join += parsedResult.layer1JoinTime
        sumEntryPointFetch += parsedResult.entryPointsFetch
        numOfLines += 1
    })
    await waitForEvent(file, 'close')
    const avgTimeToData = sumTimeToData / numOfLines
    const avgLayer1Join = sumLayer1Join / numOfLines
    const avgEntryPointFetch = sumEntryPointFetch / numOfLines
    console.log('time to data avg:', avgTimeToData)
    console.log('layer1 join avg:', avgLayer1Join)
    console.log('entry point fetch avg:', avgEntryPointFetch)
    return { timeToData: avgTimeToData, layer1Join: avgLayer1Join, entryPointFetch: avgEntryPointFetch }
}

export const propagationResults = async (filePath: string): Promise<unknown> => {
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let sumPropagationTime = 0
    let sumHops = 0
    let maxHops = 0
    let maxPropagationTime = 0
    let numOfLines = 0
    let sumMessagesReceived = 0
    file.on('line', (line: string) => {
        const parsedLine = JSON.parse(line)
        for (const resultLine of parsedLine.results) {
            const results = JSON.parse(resultLine)
            numOfLines += 1
            sumPropagationTime += results.time
            sumHops += results.hops
            sumMessagesReceived += results.numOfMessages
            if (results.hops > maxHops) {
                maxHops = results.hops
            }
            if (results.time > maxPropagationTime) {
                maxPropagationTime = results.time
            }
        }
    })
    await waitForEvent(file, 'close')

    const avgPropagationTime = sumPropagationTime / numOfLines
    const avgHops = sumHops / numOfLines
    const avgMessagesReceived = sumMessagesReceived / numOfLines
    console.log('mean propagation time:', avgPropagationTime)
    console.log('mean hops:', avgHops)
    console.log('mean messages received:', avgMessagesReceived)

    return { propagationTime: avgPropagationTime, hops: avgHops, messagesReceived: avgMessagesReceived, maxHops, maxPropagationTime }
    
} 
