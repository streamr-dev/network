import KeyHistoryStorageUtil from './KeyHistoryStorageUtil'
import LatestKeyStorageUtil from './LatestKeyStorageUtil'
import EncryptionUtil from './EncryptionUtil'

export default class KeyStorageUtil {
    static getKeyStorageUtil(publisherGroupKeys = {}, storeHistoricalKeys = true) {
        if (storeHistoricalKeys) {
            return new KeyHistoryStorageUtil(publisherGroupKeys)
        }
        return new LatestKeyStorageUtil(publisherGroupKeys)
    }

    static validateAndAddStart(publisherGroupKeys, subscriberGroupKeys) {
        const validatedPublisherGroupKeys = {}
        Object.keys(publisherGroupKeys).forEach((streamId) => {
            validatedPublisherGroupKeys[streamId] = this._getValidatedKeyObject(publisherGroupKeys[streamId])
        })

        const validatedSubscriberGroupKeys = {}
        Object.keys(subscriberGroupKeys).forEach((streamId) => {
            const streamGroupKeys = subscriberGroupKeys[streamId]
            validatedSubscriberGroupKeys[streamId] = {}
            Object.keys(streamGroupKeys).forEach((publisherId) => {
                validatedSubscriberGroupKeys[streamId][publisherId] = this._getValidatedKeyObject(streamGroupKeys[publisherId])
            })
        })

        return [validatedPublisherGroupKeys, validatedSubscriberGroupKeys]
    }

    static _getValidatedKeyObject(groupKeyObjOrString) {
        if (groupKeyObjOrString.groupKey && groupKeyObjOrString.start) {
            EncryptionUtil.validateGroupKey(groupKeyObjOrString.groupKey)
            return groupKeyObjOrString
        }
        EncryptionUtil.validateGroupKey(groupKeyObjOrString)
        return {
            groupKey: groupKeyObjOrString,
            start: Date.now()
        }
    }
}
