import { extractFileFromTarStream } from '../../src/tarHelper'
import { TestServer } from '../helpers/TestServer'

let sPort = 3197

const getServerPort = () => {
    const port = sPort
    sPort++
    return port
}
describe('tarHelper', () => {
    const serverUrl = 'http://localhost:' 
    const dbFileName = 'GeoLite2-City.mmdb'
    const tarFileName = 'GeoLite2-City.tar.gz'
    const hashFileName = 'GeoLite2-City.mmdb.sha384'

    it('happy path', async () => {
        const serverPort = getServerPort()
        const testServer = new TestServer()
        await testServer.start(serverPort)

        const abortController = new AbortController()

        const url = serverUrl + serverPort + '/' + tarFileName
        const result = await fetch(url, { signal: abortController.signal })
        try {
            await extractFileFromTarStream(dbFileName, result.body!, '/tmp')
        } catch (e) {
            console.warn(e)
        }
        await testServer.stop()
    }, 120000)

    it('throws asynchonously if the stream gets aborted', async () => {
        const serverPort = getServerPort()
        const testServer = new TestServer()
        await testServer.start(serverPort, 1)

        const abortController = new AbortController()

        setTimeout(() => {
            abortController.abort()
        }, 5000)

        const url = serverUrl + serverPort + '/' + tarFileName
        const result = await fetch(url, { signal: abortController.signal })

        await expect(extractFileFromTarStream(dbFileName, result.body!, '/tmp'))
            .rejects
            .toThrow('AbortError: This operation was aborted')

        testServer.stop()

    }, 120000)

    it('throws asynchonously if server gets shut down', async () => {
        const serverPort = getServerPort()
        const testServer = new TestServer()
        await testServer.start(serverPort, 1)

        setTimeout(() => {
            testServer.stop()
        }, 5000)

        const url = serverUrl + serverPort + '/' + tarFileName
        const result = await fetch(url)
        await expect(extractFileFromTarStream(dbFileName, result.body!, '/tmp'))
            .rejects
            .toThrow('Error extracting tarball')

    }, 120000)

    it('throws asynchonously if the stream contains garbage', async () => {
        const serverPort = getServerPort()
        const testServer = new TestServer()
        await testServer.start(serverPort)

        const url = serverUrl + serverPort + '/' + hashFileName
        const result = await fetch(url)

        await expect(extractFileFromTarStream(dbFileName, result.body!, '/tmp'))
            .rejects
            .toThrow('TAR_BAD_ARCHIVE: Unrecognized archive format')
        
        testServer.stop()
    }, 120000)

    it('throws asynchonously if the stream does not contain the desired file', async () => {
        const serverPort = getServerPort()
        const testServer = new TestServer()
        await testServer.start(serverPort)

        const url = serverUrl + serverPort + '/' + tarFileName
        const result = await fetch(url)

        await expect(extractFileFromTarStream('nonexisting-filename', result.body!, '/tmp'))
            .rejects
            .toThrow('File not found in tarball: nonexisting-filename')
        
        testServer.stop()
    }, 120000)
})
