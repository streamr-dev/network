import { GroupKey, GroupKeyish } from './GroupKey'

// TODO move to GroupKey.ts, Config.ts etc.

export type GroupKeyId = string
export type GroupKeysSerialized = Record<GroupKeyId, GroupKeyish>

export interface EncryptionConfig {
    encryptionKeys: Record<string, GroupKeysSerialized>
}

export function parseGroupKeys(groupKeys: GroupKeysSerialized = {}): Map<GroupKeyId, GroupKey> {
    return new Map<GroupKeyId, GroupKey>(Object.entries(groupKeys || {}).map(([key, value]) => {
        if (!value || !key) { return null }
        return [key, GroupKey.from(value)]
    }).filter(Boolean) as [])
}
