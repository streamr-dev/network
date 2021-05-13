// Get human-readable names for Trackers and Brokers
// Currently contains hardcoded names for all streamr-docker-dev entities
// -> in the future each node receives the peer names from Tracker
//    and we can remove the hardcoded values

const NAMES: Record<string,string> = {
    '0xDE11165537ef6C01260ee89A850a281525A5b63F': 'T1',
    '0xDE22222da3F861c2Ec63b03e16a1dce153Cf069c': 'T2',
    '0xDE33390cC85aBf61d9c27715Fa61d8E5efC61e75': 'T3',
    '0xde1112f631486CfC759A50196853011528bC5FA0': 'S1',
    '0xde222E8603FCf641F928E5F66a0CBf4de70d5352': 'B1',
    '0xde3331cA6B8B636E0b82Bf08E941F727B8927442': 'B2'
}

export class NameDirectory {

    static MAX_FALLBACK_NAME_LENGTH = 8

    // if name is not known, creates a short name from the peerId
    static getName(peerId: string): string {
        const name = NAMES[peerId]
        if (name !== undefined) {
            return name
        } else {
            return (peerId.length > NameDirectory.MAX_FALLBACK_NAME_LENGTH) 
                ? peerId.substring(0, this.MAX_FALLBACK_NAME_LENGTH)
                : peerId
        }
    }
}