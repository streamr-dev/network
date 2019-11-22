<script>
	import vis from '../node_modules/vis-network';

	import Fetch from './Fetch.svelte'
	import Network from './Network.svelte'
	import StreamList from './StreamList.svelte';

	let topology
	let network
	let streamList = []
	let trackerEndpointUrl = "http://localhost:11111/topology/"

	let nodes = new vis.DataSet();
	let edges = new vis.DataSet();

	function buildNetwork(stream) {
		let streamTopology = topology[stream]

		nodes.clear()
		edges.clear()

		Object.entries(streamTopology).map(([nodeId, neighbors]) => {
			nodes.add({
				id: nodeId,
				label: nodeId
			})

			neighbors.forEach((neighborId) => {
				const idAZ = nodeId + '_' + neighborId
				const idZA = neighborId + '_' + nodeId

				if (!edges.get(idAZ) && !edges.get(idZA)) {
					edges.add({
						id: idAZ,
						from: nodeId,
						to: neighborId
					})
				}
			})
		})
	}

	function handleFetch() {
		fetch(trackerEndpointUrl).then(function(response) {
			if (response.status !== 200) {
				let msg = `Error. Got status ${response.status} for ${trackerEndpointUrl}`
				console.error(msg)
				alert(msg)
			} else {
				return response.json()
			}
		}).then((topologyJson) => {
			topology = topologyJson
			streamList = Object.keys(topology).sort()
		}).catch(function(err) {
			alert(err)
			console.error(err)
		})
	}
</script>

<main>
    <h1 class="title">Streamr Network Topology</h1>
    <Fetch bind:trackerEndpoint={trackerEndpointUrl} handleFetch={handleFetch} />
    <div class="columns full">
        <div class="column is-one-fifth">
			<StreamList streamList={streamList} buildNetwork={(stream) => buildNetwork(stream)} />
        </div>
        <div class="column is-fullheight">
			<Network nodes={nodes} edges={edges} />
        </div>
    </div>
</main>

