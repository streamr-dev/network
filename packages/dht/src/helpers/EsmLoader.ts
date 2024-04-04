import { isBrowserEnvironment } from './browser/isBrowserEnvironment'
import { waitForCondition } from '@streamr/utils'

declare global {
    // eslint-disable-next-line no-var, no-underscore-dangle
    var _streamr_electron_test: boolean
}

export type NodeDataChannel = typeof import('node-datachannel', { with: { "resolution-mode": "import" } })

/**
 * EsmLoader is a helper class for loading ESM modules
 * into our CommonJS codebase. It will not be needed anymore
 * once the project itself is converted into ESM (NET-963). 
 * Currently only imports node-datachannel module, but more
 * modules can be added when needed. 
 * 
 * EsmLoader.init() needs to be called and awaited in an async setup function before
 * using any of the imported modules. EsmLoader.init() can be safely called 
 * multiple times, also concurrently, but will only import the modules once. 
 * After initialization, the imported modules can also be used in non-async contexts.
 * 
 * Example usage:
 * 
 * ```ts 
 * 
 * // in an async setup function
 * 
 * await EsmLoader.init()
 * 
 * // in some other part of the code
 * 
 * import { EsmLoader, NodeDataChannel } from './EsmLoader'
 * 
 * // NodeDataChannel refers to the types of the imported module
 * let peerConnection: NodeDataChannel.PeerConnection | undefined
 * 
 * // EsmLoader.nodeDataChannel is the imported module itself
 * peerConnection = new EsmLoader.nodeDataChannel.PeerConnection('someId')
 * ```
*/
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class EsmLoader {
    private static nodeDataChannelModule: NodeDataChannel | undefined
    private static importStarted = false

    private constructor() {}

    // A getter is needed in order to be able to throw 
    // an informative error if the EsmLoader is not initialized
    
    static get nodeDataChannel(): NodeDataChannel {
        if (EsmLoader.nodeDataChannelModule === undefined) {
            throw new Error('EsmLoader not initialized')
        }
        return EsmLoader.nodeDataChannelModule
    }

    /**
     * Initializes the EsmLoader by importing the ESM modules.
     * MUST be called and awaited before using any of the imported modules.
     * MAY be safely called multiple times, also concurrently, 
     * but will only import the modules once. 
    */

    static async init(): Promise<void> {
        if (!isBrowserEnvironment() && typeof _streamr_electron_test === 'undefined') {

            if (!EsmLoader.importStarted) {
                // if import has not started yet, start it
                EsmLoader.importStarted = true
                // eslint-disable-next-line require-atomic-updates
                EsmLoader.nodeDataChannelModule = await import('node-datachannel')
                EsmLoader.nodeDataChannelModule.initLogger('Fatal')
            } else if (EsmLoader.nodeDataChannelModule === undefined) {
                // if another import has started but not finished yet, wait for it to finish
                await waitForCondition(() => EsmLoader.nodeDataChannelModule !== undefined)
            }
        }
    }
}
