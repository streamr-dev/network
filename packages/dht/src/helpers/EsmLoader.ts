import { isBrowserEnvironment } from './browser/isBrowserEnvironment'
import { waitForCondition } from '@streamr/utils'

declare global {
    // eslint-disable-next-line no-var, no-underscore-dangle
    var _streamr_electron_test: boolean
}

export type NodeDataChannel = typeof import('node-datachannel', { with: { "resolution-mode": "import" } })

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class EsmLoader {
    private static nodeDataChannelModule: NodeDataChannel | undefined
    private static importStarted = false

    static get nodeDataChannel(): NodeDataChannel {
        if (EsmLoader.nodeDataChannelModule === undefined) {
            throw new Error('EsmLoader not initialized')
        }
        return EsmLoader.nodeDataChannelModule
    }
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
