import crypto from 'crypto'
import fs from 'fs'
import { CityResponse, Reader } from 'mmdb-lib'
import { extractFileFromTarStream } from './tarHelper'
import { v4 } from 'uuid'
import { Logger } from '@streamr/utils'

const GEOIP_MIRROR_URL = 'https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/master/redist/'
const DB_NAME = 'GeoLite2-City'
const TAR_SUFFFIX = '.tar.gz'
const DB_SUFFIX = '.mmdb'
const HASH_SUFFIX = '.mmdb.sha384'

const logger = new Logger(module)

const downloadNewDb = async (
    url: string,
    dbFolder: string,
    remoteHash: string,
    abortSignal: AbortSignal
): Promise<void> => {
    // make a unique name for the temporary download folder
    // in case there are multiple downloads happening at the same time

    const uniqueName = v4()
    const downloadFolder = dbFolder + '.download' + uniqueName
    const dbFileName = DB_NAME + DB_SUFFIX
    const dbFileInDownloadFolder = downloadFolder + '/' + dbFileName
    const dbFileInDbFolder = dbFolder + dbFileName

    let response: Response

    try {
        logger.debug('Downloading GeoIP database from: ' + url)
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
        fs.mkdirSync(downloadFolder, { recursive: true })
    } catch (e) {
        throw new Error('Error creating temporary folder ' + downloadFolder + ', error: ' + e)
    }

    try {
        await extractFileFromTarStream(dbFileName, response.body!, downloadFolder)
    } catch (e) {
        try {
            fs.rmSync(downloadFolder, { recursive: true })
        } catch {
            // ignore error when removing the temporary folder
        }
        throw e
    }

    // check the hash of the extracted file

    if (!isDbFileValid(dbFileInDownloadFolder, remoteHash)) {
        try {
            fs.rmSync(downloadFolder, { recursive: true })
        } catch {
            // ignore error when removing the temporary folder
        }
        throw new Error('Downloaded database hash does not match the expected hash')
    }

    try {
        // move the extracted file to the correct location
        fs.renameSync(dbFileInDownloadFolder, dbFileInDbFolder)
    } catch (e) {
        throw new Error('Error moving ' + dbFileInDownloadFolder + ' to ' + dbFileInDbFolder + ', error: ' + e)
    } finally {
        try {
            fs.rmSync(downloadFolder, { recursive: true })
        } catch {
            // ignore error when removing the temporary folder
        }
    }

    // set the db file permissions to rw only for the owner

    try {
        fs.chmodSync(dbFileInDbFolder, 0o600)
    } catch (err) {
        throw new Error('Error setting permissions on ' + dbFileInDbFolder + ', error: ' + err)
    }

    logger.debug('Downloaded GeoIP database to: ' + dbFileInDbFolder)
}

const downloadRemoteHash = async (remoteHashUrl: string, abortSignal: AbortSignal): Promise<string> => {
    // download the hash of the latest GeoIP database using fetch as text and trim it
    let response: Response

    try {
        logger.debug('Downloading GeoIP database hash from: ' + remoteHashUrl)
        response = await fetch(remoteHashUrl, { signal: abortSignal })
    } catch (e) {
        // Catching and re-throwing as async exception
        // here is necessary, synch exceptions cannot be caught by the caller
        throw new Error('Fetch error when downloading ' + remoteHashUrl + ', error: ' + e)
    }

    if (!response.ok) {
        throw new Error('HTTP error when downloading ' + remoteHashUrl + ', status: ' + response.status)
    }

    return (await response.text()).trim()
}

const isDbFileValid = (dbFile: string, remoteHash: string): boolean => {
    // check if the local db exists and calculate its hash

    try {
        const db = fs.readFileSync(dbFile)
        const localHash = crypto.createHash('sha384').update(db).digest('hex')

        // if the hashes are different, download the latest database
        if (localHash !== remoteHash) {
            return false
        } else {
            return true
        }
    } catch {
        // if the local db does not exist, or some other exception occurres db is not considered valid
        return false
    }
}

// returns a Reader if a new db was downloaded, or if the caller wants to force return a reader
// also if there was no need to download a new db

export const downloadGeoIpDatabase = async (
    dbFolder: string,
    forceReturnReader: boolean,
    abortSignal: AbortSignal,
    mirrorUrl?: string
): Promise<Reader<CityResponse> | undefined> => {
    // This will throw if the download folder is not readable
    if (!fs.existsSync(dbFolder)) {
        // This will throw if the download folder is not writable
        fs.mkdirSync(dbFolder, { recursive: true })
    }
    if (!dbFolder.endsWith('/')) {
        dbFolder += '/'
    }
    let geoIpMirrorUrl = GEOIP_MIRROR_URL
    if (mirrorUrl !== undefined) {
        if (!mirrorUrl.endsWith('/')) {
            mirrorUrl += '/'
        }
        geoIpMirrorUrl = mirrorUrl
    }
    const remoteHashUrl = geoIpMirrorUrl + DB_NAME + HASH_SUFFIX
    const dbDownloadUrl = geoIpMirrorUrl + DB_NAME + TAR_SUFFFIX
    const dbFileInDbFolder = dbFolder + DB_NAME + DB_SUFFIX

    const remoteHash = await downloadRemoteHash(remoteHashUrl, abortSignal)
    const dbValid = isDbFileValid(dbFileInDbFolder, remoteHash)
    if (dbValid === false) {
        await downloadNewDb(dbDownloadUrl, dbFolder, remoteHash, abortSignal)
        // return new reader if db was downloaded
        return new Reader<CityResponse>(fs.readFileSync(dbFileInDbFolder))
    } else {
        logger.debug('The hash of the local GeoIP database matches the remote hash, no need to download a new database')
    }
    if (forceReturnReader) {
        // return reader also for old db the caller wants it
        return new Reader<CityResponse>(fs.readFileSync(dbFileInDbFolder))
    } else {
        // return undefined if the db is already up to date
        return undefined
    }
}
