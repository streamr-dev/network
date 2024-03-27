import crypto from 'crypto'
import fs from 'fs'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import tar from 'tar'
import NodePath from 'path'     // use NodePath to avoid conflict with other 'path' symbols
import { CityResponse, Reader } from 'mmdb-lib'

const GEOIP_MIRROR_URL = 'https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/master/redist/'
const DB_NAME = 'GeoLite2-City'
const TAR_SUFFFIX = '.tar.gz'
const DB_SUFFIX = '.mmdb'
const HASH_SUFFIX = '.mmdb.sha384'

const downloadNewDb = async (url: string, dbPath: string, remoteHash: string, 
    abortSignal: AbortSignal): Promise<void> => {

    let response: Response | undefined

    try {
        response = await fetch(url, { keepalive: false, signal: abortSignal })
    } catch (e) {
        // Catching and re-throwing as async exception 
        // here is necessary, synch exceptions cannot be caught by the caller
        throw new Error('Fetch error when downloading ' + url + ', error: ' + e)
    }

    if (!response.ok) {
        throw new Error('HTTP error when downloading ' + url + ', status: ' + response.status)
    }

    // extract the tarball to a temporary folder

    try {
        fs.mkdirSync(dbPath + '.download', { recursive: true })
    } catch (e) {
        throw new Error('Error creating temporary folder ' + dbPath + '.download, error: ' + e)
    }

    let nodeStream: Readable | undefined
    try {
        nodeStream = Readable.fromWeb(response.body!)
        await finished(nodeStream
            .pipe(tar.x({
                cwd: dbPath + '.download',
                filter: (entryPath: string): boolean => NodePath.basename(entryPath) === (DB_NAME + DB_SUFFIX),
                strip: 1
            })))
    } catch (e) {
        try {
            fs.rmSync(dbPath + '.download', { recursive: true })
        } catch (e2) {
            // ignore error when removing the temporary folder
        }
        throw new Error('Error extracting tarball to ' + dbPath + '.download, error: ' + e)
    } finally {
        if (nodeStream !== undefined) {
            nodeStream.destroy()
        }
    }

    // check the hash of the extracted file

    if (!isCurrentDbValid(dbPath + '.download/', remoteHash)) {
        try {
            fs.rmSync(dbPath + '.download', { recursive: true })
        } catch (e2) {
            // ignore error when removing the temporary folder
        }
        throw new Error('Downloaded database hash does not match the expected hash')
    }

    try {
        // move the extracted file to the correct location
        fs.renameSync(dbPath + '.download/' + DB_NAME + DB_SUFFIX, dbPath + DB_NAME + DB_SUFFIX)
    } catch (e) {
        throw new Error('Error moving ' + dbPath + '.download/' + DB_NAME + DB_SUFFIX + ' to ' + dbPath + DB_NAME + DB_SUFFIX + ', error: ' + e)
    } finally {
        try {
            fs.rmSync(dbPath + '.download', { recursive: true })
        } catch (e2) {
            // ignore error when removing the temporary folder
        }
    }
}

const downloadRemoteHash = async (abortSignal: AbortSignal): Promise<string> => {
    // download the hash of the latest GeoIP database using fetch as text and trim it
    const url = GEOIP_MIRROR_URL + DB_NAME + HASH_SUFFIX
    let response: Response | undefined
    
    try {
        response = await fetch(url, { signal: abortSignal })
    } catch (e) {
        // Catching and re-throwing as async exception 
        // here is necessary, synch exceptions cannot be caught by the caller
        throw new Error('Fetch error when downloading ' + url + ', error: ' + e)
    }

    if (!response.ok) {
        throw new Error('HTTP error when downloading ' + url + ', status: ' + response.status)
    }
    
    return (await response.text()).trim()
}

const isCurrentDbValid = async (dbPath: string, remoteHash: string): Promise<boolean> => {
    // check if the local db exists and calculate its hash
    const localDbPath = dbPath + DB_NAME + DB_SUFFIX

    try {
        const db = fs.readFileSync(localDbPath)
        const localHash = crypto.createHash('sha384').update(db).digest('hex')

        // if the hashes are different, download the latest database
        if (localHash !== remoteHash) {
            return false
        } else {
            return true
        }
    } catch (e) {
        // if the local db does not exist, or some other exception occurres db is not considered valid
        return false
    }
}

export const downloadGeoIpDatabase = async (dbFolder: string, forceReturnReader: boolean,
    abortSignal: AbortSignal): Promise<Reader<CityResponse> | undefined> => {
    // This will throw if the download folder is not readable
    if (!fs.existsSync(dbFolder)) {
        // This will throw if the download folder is not writable
        fs.mkdirSync(dbFolder, { recursive: true })
    }

    if (!dbFolder.endsWith('/')) {
        dbFolder += '/'
    }

    const remoteHash = await downloadRemoteHash(abortSignal)
    
    const isDbValid = await isCurrentDbValid(dbFolder, remoteHash)
    
    if (isDbValid === false) {
        await downloadNewDb(GEOIP_MIRROR_URL + DB_NAME + TAR_SUFFFIX, dbFolder, remoteHash, abortSignal)
        // return new reader if db was downloaded
        return new Reader<CityResponse>(fs.readFileSync(dbFolder + DB_NAME + DB_SUFFIX))
    }

    if (forceReturnReader) {
        // return reader also for old db the caller wants it
        return new Reader<CityResponse>(fs.readFileSync(dbFolder + DB_NAME + DB_SUFFIX))
    } else {
        // return undefined if the db is already up to date
        return undefined
    }
}
