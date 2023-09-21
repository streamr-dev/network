import os from 'os'

export function filePathToNodeFormat(filePath: string): string {
    if (filePath.startsWith('~/')) {
        return filePath.replace('~', os.homedir())
    } else {
        return filePath
    }
}
