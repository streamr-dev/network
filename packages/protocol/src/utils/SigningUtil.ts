import { verifyMessage, Wallet  } from '@ethersproject/wallet'
import { EthereumAddress } from './types'

export default class SigningUtil {
    static async sign(payload: string, privateKey: string): Promise<string> {
        // TODO calculating the wallet address may be slow?
        // therefor users could instead call these directly:
        // - create one Wallet instance
        // - for each message call wallet.signMessage(payload)
        //
        return new Wallet(privateKey).signMessage(payload)
    }

    static verify(address: EthereumAddress, payload: string, signature: string): boolean {
        try {
            const recoveredAddress = verifyMessage(payload, signature)
            return recoveredAddress.toLowerCase() === address.toLowerCase()
        } catch (err) {
            return false
        }
    }
}
