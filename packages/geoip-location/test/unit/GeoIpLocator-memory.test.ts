import { setFlagsFromString } from 'v8'
import { runInNewContext } from 'vm'
import fs from 'fs'
import { GeoIpLocator } from '../../src/GeoIpLocator'
import { wait } from '@streamr/utils'
import { TestServer } from '../helpers/TestServer'

setFlagsFromString('--expose_gc')
const gc = runInNewContext('gc')

describe('tests with non-standard startup', () => { 
    let dbDir: string | undefined
    let locator: GeoIpLocator | undefined
    let dirCounter = 0
    let testServer: TestServer | undefined

    const serverPort = 31994
    const mirrorUrl = 'http://localhost:' + serverPort + '/'

    const dbPath = '/tmp'

    const getDbDir = () => {
        dirCounter++
        return dbPath + '/geolite2memory-' + dirCounter
    }

    afterEach(async () => {
        locator!.stop()
        testServer!.stop()
        fs.unlinkSync(dbDir + '/GeoLite2-City.mmdb')
        fs.rmSync(dbDir!, { recursive: true })
    })

    it('does not leak memory in monthly database check', async () => {
        testServer = new TestServer()
        await testServer.start(serverPort)

        dbDir = getDbDir()
        locator = new GeoIpLocator(dbDir, 1000, 1000, mirrorUrl)
        
        await locator.start()
        gc()
        await wait(3000)
        const heapUsed = process.memoryUsage().heapUsed
        await wait(10000)
        await locator.stop()
        gc()
        await wait(3000)
        const heapUsed2 = process.memoryUsage().heapUsed
        expect(heapUsed2).toBeLessThanOrEqual(heapUsed)
    }, 120000)
})
