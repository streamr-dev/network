const getPeersTopology = (peers, currentPeer) => getRandomPeers(filterOutPeer(peers, currentPeer))

const filterOutPeer = (peers, currentPeer) => [...peers.keys()].filter(k => k !== currentPeer)

const getRandomPeers = (peers, max = 3) => peers

module.exports = {
    getPeersTopology
}
