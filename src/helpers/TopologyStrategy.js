const getPeersTopology = (peers, currentPeer) => _getRandomPeers(_filterOutPeer(peers, currentPeer))

const _filterOutPeer = (peers, currentPeer) => [...peers.keys()].filter(k => k !== currentPeer)

const _getRandomPeers = (peers, max = 3) => peers

module.exports = {
    getPeersTopology
}
