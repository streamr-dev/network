import { waitForEvent3 } from '@streamr/utils'
import { extractFileFromTarStream } from '../../src/tarHelper'
import { TestServer, TestServerEvents } from '../helpers/TestServer'

describe('tarHelper', () => {
    const serverUrl = 'http://127.0.0.1:'
    const dbFileName = 'GeoLite2-City.mmdb'
    const tarFileName = 'GeoLite2-City.tar.gz'
    const hashFileName = 'GeoLite2-City.mmdb.sha384'

    let testServer: TestServer

    afterEach(async () => {
        await testServer!.stop()
    })

    describe('testsWithNormalServer', () => {
        const serverPort = 3197

        beforeEach(async () => {
            testServer = new TestServer()
            await testServer.start(serverPort)
        })

        it('happy path', async () => {
            const url = serverUrl + serverPort + '/' + tarFileName
            const result = await fetch(url, { keepalive: false })

            await extractFileFromTarStream(dbFileName, result.body!, '/tmp')
        })

        it('throws asynchonously if the stream contains garbage', async () => {
            const url = serverUrl + serverPort + '/' + hashFileName
            const result = await fetch(url)

            await expect(extractFileFromTarStream(dbFileName, result.body!, '/tmp')).rejects.toThrow(
                'TAR_BAD_ARCHIVE: Unrecognized archive format'
            )
        })

        it('throws asynchonously if the stream does not contain the desired file', async () => {
            const url = serverUrl + serverPort + '/' + tarFileName
            const result = await fetch(url)

            await expect(extractFileFromTarStream('nonexisting-filename', result.body!, '/tmp')).rejects.toThrow(
                'File not found in tarball: nonexisting-filename'
            )
        })
    })

    describe('testsWithThrottledServer', () => {
        const serverPort = 3198

        beforeEach(async () => {
            testServer = new TestServer()
            await testServer.start(serverPort, 1)
        })

        it(
            'throws asynchonously if the stream gets aborted',
            async () => {
                const abortController = new AbortController()

                setTimeout(() => {
                    abortController.abort()
                }, 5000)

                const url = serverUrl + serverPort + '/' + tarFileName
                const result = await fetch(url, { signal: abortController.signal })

                await expect(extractFileFromTarStream(dbFileName, result.body!, '/tmp')).rejects.toThrow(
                    'AbortError: This operation was aborted'
                )
            },
            15 * 1000
        )

        it(
            'throws asynchonously if server gets shut down',
            async () => {
                const closedPromise = waitForEvent3<TestServerEvents>(testServer!, 'closed', 10000)
                setTimeout(async () => {
                    await testServer!.stop()
                }, 5000)

                const url = serverUrl + serverPort + '/' + tarFileName
                const result = await fetch(url)
                await expect(extractFileFromTarStream(dbFileName, result.body!, '/tmp')).rejects.toThrow(
                    'Error extracting tarball'
                )
                await closedPromise
            },
            15 * 1000
        )
    })
})
