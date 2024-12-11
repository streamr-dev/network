import { waitForEvent } from '@streamr/utils'
import fs from 'fs'
const readline = require('readline')

const filePath = process.argv[2]

const parseId = (id: string): { ip: string, region: string } => {
    const split = id.split('_')
    const ip = split[1]
    const region = split[0]
    return { ip, region }
}

const getIpToRegion = async (filePath: string): Promise<Map<string, string>> => {
    const ipToRegion = new Map<string, string>()
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    file.on('line', (line: string) => {
        const parsedLine = JSON.parse(line)
        const { ip, region } = parseId(parsedLine.id)
        ipToRegion.set(ip, region)
    })
    await waitForEvent(file, 'close')
    return ipToRegion
}

const pingResults = async (filePath: string): Promise<void> => {
    const ipToRegion = await getIpToRegion(filePath)
    const pingTable = new Map<string, Map<string, number>>()
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let sumPing = 0
    let numOfPings = 0
    file.on('line', (line: string) => {
        const parsedLine = JSON.parse(line)
        const from = parsedLine.id
        const { region: fromRegion } = parseId(from)
        const results = JSON.parse(parsedLine.results)
        pingTable.set(fromRegion, new Map<string, number>())
        for (const result of results) {
            const toRegion = ipToRegion.get(result.ip)!
            const ping = result.time
            sumPing += ping
            numOfPings += 1
            pingTable.get(fromRegion)!.set(toRegion, ping)
        }
    })
    await waitForEvent(file, 'close')
    console.log('pingTable', pingTable)
    console.log('avgRtt', sumPing / numOfPings)
    console.log('avgOneWay', sumPing / (numOfPings * 2))
}

pingResults(filePath)