// import { StreamMessage } from 'streamr-client-protocol'

// import EncryptionUtil, { UnableToDecryptError } from '../stream/encryption/Encryption'
// import { SubscriberKeyExchange } from '../stream/encryption/KeyExchangeSubscriber'
// import { BrubeckClient } from './BrubeckClient'
// import { kPipelineTransform, PipelineTransformer } from '../utils/Pipeline'

// export default function Decrypt(client: BrubeckClient, options?: DecryptWithExchangeOptions) {
    // if (!client.options.keyExchange) {
        // return new DecryptionDisabled()
    // }

    // return new DecryptWithExchange(client, options)
// }

// class DecryptionDisabled<T> implements PipelineTransformer {
    // async* [kPipelineTransform](src: AsyncGenerator<StreamMessage<T>>) {
        // for await (const streamMessage of src) {
            // if (streamMessage.groupKeyId) {
                // throw new UnableToDecryptError('No keyExchange configured, cannot decrypt any message.', streamMessage)
            // }

            // yield streamMessage
        // }
    // }
// }

// type DecryptWithExchangeOptions = {
// }

// class DecryptWithExchange<T> implements PipelineTransformer {


    // const keyExchange = new SubscriberKeyExchange(client.client, {
        // ...options,
        // groupKeys: {
            // ...client.options.groupKeys,
            // ...options.groupKeys,
        // }
    // })

    // async function* decrypt(src: AsyncGenerator<StreamMessage<T>>, onError = async (_err?: Error, _streamMessage?: StreamMessage<T>) => {}) {
        // for await (const streamMessage of src) {
            // if (!streamMessage.groupKeyId) {
                // yield streamMessage
                // continue
            // }

            // if (streamMessage.encryptionType !== StreamMessage.ENCRYPTION_TYPES.AES) {
                // yield streamMessage
                // continue
            // }

            // try {
                // const groupKey = await keyExchange.getGroupKey(streamMessage).catch((err) => {
                    // throw new UnableToDecryptError(`Could not get GroupKey: ${streamMessage.groupKeyId} – ${err.stack}`, streamMessage)
                // })

                // if (!groupKey) {
                    // throw new UnableToDecryptError([
                        // `Could not get GroupKey: ${streamMessage.groupKeyId}`,
                        // 'Publisher is offline, key does not exist or no permission to access key.',
                    // ].join(' '), streamMessage)
                // }

                // await EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
                // await keyExchange.addNewKey(streamMessage)
            // } catch (err) {
                // // clear cached permissions if cannot decrypt, likely permissions need updating
                // client.client.cached.clearStream(streamMessage.getStreamId())
                // await onError(err, streamMessage)
            // } finally {
                // yield streamMessage
            // }
        // }
    // }

    // return Object.assign(decrypt, {
        // async stop() {
            // return keyExchange.stop()
        // }
    // })
// }
