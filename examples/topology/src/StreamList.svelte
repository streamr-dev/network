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
            <p class="control has-icons-left">
                <input class="input" type="text" placeholder="Search" bind:value={filter}>
                <span class="icon is-left">
                    <i class="fa fa-exchange" aria-hidden="true"></i>
                </span>
            </p>
        </div>
        {#each streams as stream}
            <a class="panel-block is-active" on:click|preventDefault={() => buildNetwork(stream)}>
					<span class="panel-icon">
						<i class="fas fa-book" aria-hidden="true"></i>
					</span>
                {stream}
            </a>
        {/each}
    </nav>
</section>
