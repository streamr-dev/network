import crypto from 'crypto'

// https://www.scs.stanford.edu/~dm/home/papers/kpos.pdf
const KADEMLIA_ID_LENGTH_IN_BYTES = 20

export const createRandomKademliaId = () => {
    return crypto.randomBytes(KADEMLIA_ID_LENGTH_IN_BYTES)
}