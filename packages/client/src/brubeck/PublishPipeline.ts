import { MessageContent, SPID } from 'streamr-client-protocol'

import MessageStream from './MessageStream'

import { CachedMessageChainer } from '../publish/MessageChainer'
import { BrubeckClient } from './BrubeckClient'
import Signer, { AuthOption } from '../publish/Signer'

export { SignatureRequiredError } from '../subscribe/Validator'

/**
 * Subscription message processing pipeline
 */

export default class PublishPipeline<T extends MessageContent | unknown> extends MessageStream<T> {
    client
    spid
    options
    getMsgChainer
    signStreamMessage

    constructor(client: BrubeckClient, spid: SPID, options: any = {}) {
        super(client, options)
        this.client = client
        this.spid = spid
        this.options = options
        this.getMsgChainer = CachedMessageChainer(client.options.cache)
        this.signStreamMessage = Signer({
            ...client.options.auth,
        } as AuthOption, client.options.publishWithSignature)
    }

    stop() {
        this.getMsgChainer.clear()
    }

}
