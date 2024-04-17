import { downloadGeoIpDatabase } from '../../src/downloadGeoIpDatabase'
import fs from 'fs'
import { TestServer } from '../helpers/TestServer'

describe('downloadGeoIpDatabase', () => {
    const serverPort = 31993
    const mirrorUrl = 'http://localhost:' + serverPort + '/'

    let testServer: TestServer | undefined
    const abortController = new AbortController()
    const path = '/tmp/downloadGeoIpDatabaseTest/'

    beforeAll(async () => {
        testServer = new TestServer()
        await testServer.start(serverPort)
    }, 120000)

    afterAll(async () => {
        testServer!.stop()
    })

    beforeEach(() => {
        try {
            fs.rmSync(path, { recursive: true })
        } catch (e) {
            // ignore error when removing the test
        }
    })

    it('downloads the database with correct file permissions', async () => {
        const reader = await downloadGeoIpDatabase(path, false, mirrorUrl, abortController.signal)

        expect(fs.existsSync(path)).toBe(true)
        expect(fs.existsSync(path + '/GeoLite2-City.mmdb')).toBe(true)

        // https://www.martin-brennan.com/nodejs-file-permissions-fstat/
        const permissions = fs.statSync(path + '/GeoLite2-City.mmdb').mode & 0o777
        
        // on windows the permissions might be 0o666
        expect(permissions === 0o600 || permissions === 0o666).toBe(true)
        expect(reader).toBeDefined()
    }, 60000)

    it('throws if the path is not writable', async () => {
        const path = '/etc/downloadGeoIpDatabaseTest/'
        await expect(downloadGeoIpDatabase(path, false, mirrorUrl, abortController.signal)).rejects.toThrow()
    }, 60000)

    it('throws if the path does not exist', async () => {
        const path = '/nonexistent/downloadGeoIpDatabaseTest/'
        await expect(downloadGeoIpDatabase(path, false, mirrorUrl, abortController.signal)).rejects.toThrow()
    }, 60000)

    it('does not download the database if it is already up to date', async () => {
        const path = '/tmp/downloadGeoIpDatabaseTest/'
        
        const newReader = await downloadGeoIpDatabase(path, false, mirrorUrl, abortController.signal)
        expect(newReader).toBeDefined()

        const newReader2 = await downloadGeoIpDatabase(path, false, mirrorUrl, abortController.signal)
        expect(newReader2).toBeUndefined()
        
        const newReader3 = await downloadGeoIpDatabase(path, true, mirrorUrl, abortController.signal)
        expect(newReader3).toBeDefined()
    }, 60000)
})
