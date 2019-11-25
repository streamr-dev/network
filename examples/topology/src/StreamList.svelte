<script>
    export let streamList = []
    export let buildNetwork = () => {}

    let filter = ''
    $: streams = streamList.filter((stream) => stream.includes(filter)).sort()

</script>

<section class="hero" style="height: 900px; overflow: auto; max-height: 900vh;">
    <nav class="panel">
        <p class="panel-heading">
            List of streams:
        </p>
        <div class="panel-block">
            <p class="control">
                <input class="input" type="text" placeholder="Search" bind:value={filter}>
            </p>
        </div>
        {#each streams as stream}
            <a class="panel-block is-active" on:click|preventDefault={() => buildNetwork(stream)}>{stream}</a>
        {/each}
    </nav>
</section>
