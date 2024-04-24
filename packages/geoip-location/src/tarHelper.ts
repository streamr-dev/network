import { Readable, pipeline } from 'stream'
import tar from 'tar'
import { ReadableStream } from 'stream/web'
import NodePath from 'path'     // use NodePath to avoid conflict with other 'path' symbols
import fs from 'fs'

const doExtractFileFromTarStream = (fileName: string, stream: ReadableStream<any>, downloadFolder: string): Promise<void> => {
    // Async/await style does not work here because catching the onAborted errors 
    // with try-catch does not seem to work

    return new Promise((resolve, reject) => {
        try {
            const nodeStream = Readable.fromWeb(stream)
            pipeline(nodeStream,
                tar.x({
                    cwd: downloadFolder,
                    filter: (entryPath: string): boolean => NodePath.basename(entryPath) === fileName,
                    strip: 1
                }), (err) => {
                    if (err) {
                        reject(new Error('Error extracting tarball to ' + downloadFolder + ', error: ' + err))
                    } else {
                        resolve()
                    }
                })
        } catch (e) {
            reject(new Error('Failed to create nodejs Readable from web stream: ' + e))
        }
    })
}

export const extractFileFromTarStream = async (fileName: string, stream: ReadableStream<any>, downloadFolder: string): Promise<void> => {
    await doExtractFileFromTarStream(fileName, stream, downloadFolder)
    if (!fs.existsSync(NodePath.join(downloadFolder, fileName))) {
        throw new Error('File not found in tarball: ' + fileName)
    }
}

