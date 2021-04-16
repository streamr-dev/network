import { computeAddress } from '@ethersproject/transactions'
import { Web3Provider } from '@ethersproject/providers'
import { hexlify } from '@ethersproject/bytes'
import { sha256 } from '@ethersproject/sha2'
import { StreamrClient } from '../StreamrClient'
import { EthereumConfig } from '../Config'

async function getUsername(client: StreamrClient) {
    const { options: { auth = {} } = {} } = client
    if (auth.username) { return auth.username }

    const { username, id } = await client.cached.getUserInfo()
    return (
        username
        // edge case: if auth.apiKey is an anonymous key, userInfo.id is that anonymous key
        // update: not sure if still needed now that apiKey auth has been disabled
        || id
    )
}

export async function getAddressFromOptions({ ethereum, privateKey }: { ethereum?: EthereumConfig, privateKey?: any} = {}) {
    if (privateKey) {
        return computeAddress(privateKey).toLowerCase()
    }

    if (ethereum) {
        const provider = new Web3Provider(ethereum)
        const address = await provider.getSigner().getAddress()
        return address.toLowerCase()
    }

    throw new Error('Need either "privateKey" or "ethereum".')
}

export async function getUserId(client: StreamrClient) {
    if (client.session.isUnauthenticated()) {
        throw new Error('Need to be authenticated to getUserId.')
    }

    const { options: { auth = {} } = {} } = client
    if (auth.ethereum || auth.privateKey) {
        return getAddressFromOptions(auth)
    }

    const username = await getUsername(client)

    if (username != null) {
        const hexString = hexlify(Buffer.from(username, 'utf8'))
        return sha256(hexString)
    }

    throw new Error('Need either "privateKey", "ethereum" or "sessionToken" to derive the publisher Id.')
}
