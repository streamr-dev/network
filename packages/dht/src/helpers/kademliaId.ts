import crypto from 'crypto'

export const createRandomKademliaId = () => {
    return crypto.randomBytes(8)
}