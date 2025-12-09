import md5 from 'md5'
import { hexToBinary } from '../binaryUtils'

export function computeMd5(input: string): Buffer {
    return Buffer.from(hexToBinary(md5(input)))
}
