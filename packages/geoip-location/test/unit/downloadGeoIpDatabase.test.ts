import { downloadGeoIpDatabase } from '../../src/downloadGeoIpDatabase'
import fs from 'fs'

describe('downloadGeoIpDatabase', () => {
    const abortController = new AbortController()
    const path = '/tmp/downloadGeoIpDatabaseTest/'

    it('downloads the database', async () => {
        const reader = await downloadGeoIpDatabase(path, false, abortController.signal)

        expect(reader).toBeDefined()
        expect(fs.existsSync(path)).toBe(true)
        expect(fs.existsSync(path + '.download')).toBe(false)
        expect(fs.existsSync(path + '/GeoLite2-City.mmdb')).toBe(true)
    
        fs.rmSync(path, { recursive: true })
    })

    it('throws if the path is not writable', async () => {
        const path = '/etc/downloadGeoIpDatabaseTest/'
        await expect(downloadGeoIpDatabase(path, false, abortController.signal)).rejects.toThrow()
    })

    it('throws if the path does not exist', async () => {
        const path = '/nonexistent/downloadGeoIpDatabaseTest/'
        await expect(downloadGeoIpDatabase(path, false, abortController.signal)).rejects.toThrow()
    })

    it('does not download the database if it is already up to date', async () => {
        const path = '/tmp/downloadGeoIpDatabaseTest/'
        
        const newReader = await downloadGeoIpDatabase(path, false, abortController.signal)
        expect(newReader).toBeDefined()

        const newReader2 = await downloadGeoIpDatabase(path, false, abortController.signal)
        expect(newReader2).toBeUndefined()
        
        const newReader3 = await downloadGeoIpDatabase(path, true, abortController.signal)
        expect(newReader3).toBeDefined()
        
        fs.rmSync(path, { recursive: true })
    })
})
