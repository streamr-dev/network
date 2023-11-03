import os from 'os'

// TODO: use untildify instead?
export function filePathToNodeFormat(filePath: string): string {
    if (filePath.startsWith('~/')) {
        return filePath.replace('~', os.homedir())
    } else {
        return filePath
    }
}
