const getRandomPeers = (peers, max = 10) => {
    let randomPeers = []

    if (peers.length <= max) {
        randomPeers = peers
    } else {
        while (randomPeers.length < max) {
            const peer = peers[Math.floor(Math.random() * peers.length)]

            if (randomPeers.indexOf(peer) === -1) {
                randomPeers.push(peer)
            }
        }
    }

    return randomPeers
}

const filterOutPeer = (peers, currentPeer) => peers.filter((k) => k !== currentPeer)

const getPeersTopology = (peers, currentPeer) => getRandomPeers(filterOutPeer(peers, currentPeer))

module.exports = {
    getPeersTopology
}
