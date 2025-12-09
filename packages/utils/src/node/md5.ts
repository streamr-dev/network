import crypto from 'crypto'

export function computeMd5(input: string): Buffer {
    return crypto.createHash('md5').update(input).digest()
}
