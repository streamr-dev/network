<script>
    import { onMount } from 'svelte';
    import vis from '../node_modules/vis-network';

    let network
    // create an array with nodes
    export let nodes = new vis.DataSet([]);

    // create an array with edges
    export let edges = new vis.DataSet([]);

    onMount(async () => {
        // create a network
        let container = document.getElementById('network');
        let data = {
            nodes: nodes,
            edges: edges
        };
        let options = {
            nodes: {
                shape: 'dot',
                size: 16
            },
            layout:{
                randomSeed: 34
            },
            physics: {
                forceAtlas2Based: {
                    gravitationalConstant: -26,
                    centralGravity: 0.005,
                    springLength: 230,
                    springConstant: 0.18
                },
                maxVelocity: 146,
                solver: 'forceAtlas2Based',
                timestep: 0.35,
                stabilization: {
                    enabled:true,
                    iterations:2000,
                    updateInterval:25
                }
            }
        };

        network = new vis.Network(container, data, options);
    });
</script>

<section id="network" class="hero is-fullheight" style="height: 100%">
</section>
