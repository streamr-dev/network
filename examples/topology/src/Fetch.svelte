<script>
    export let trackerEndpoint = ""
    export let handleFetch = () => {}
</script>
<div class="field is-horizontal">
    <div class="field-body">
        <div class="field">
            <p class="control has-icons-left">
                <input class="input is-primary" type="url" bind:value={trackerEndpoint}>
                <span class="icon is-small is-left"><i class="fa fa-search"></i></span>
            </p>
        </div>
        <div class="field">
            <div class="control">
                <button class="button is-success" on:click={handleFetch}>Fetch</button>
            </div>
        </div>
    </div>
</div>
