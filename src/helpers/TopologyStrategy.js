const getRandomPeers = (peers, max = 3) => peers

const filterOutPeer = (peers, currentPeer) => [...peers.keys()].filter((k) => k !== currentPeer)

const getPeersTopology = (peers, currentPeer) => getRandomPeers(filterOutPeer(peers, currentPeer))

module.exports = {
    getPeersTopology
}
