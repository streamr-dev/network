// Get human-readable names for Trackers and Brokers
// Currently contains hardcoded names for all streamr-docker-dev entities
// -> in the future each node receives the peer names from Tracker
//    and we can remove the hardcoded values

const NAMES: Record<string,string> = {
    '0xb9e7cEBF7b03AE26458E32a059488386b05798e8': 'T1',
    '0x0540A3e144cdD81F402e7772C76a5808B71d2d30': 'T2',
    '0xf2C195bE194a2C91e93Eacb1d6d55a00552a85E2': 'T3',
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
