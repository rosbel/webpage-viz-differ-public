<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  const VIEWPORT_PRESETS = [
    { name: 'desktop', width: 1440, height: 900, checked: true },
    { name: 'tablet', width: 768, height: 1024, checked: false },
    { name: 'mobile', width: 390, height: 844, checked: true }
  ];

  let baseA = $state('');
  let baseB = $state('');
  let pathsText = $state('/');
  let maskText = $state('');
  let useThreshold = $state(false);
  let maxDiffPercent = $state(0.1);
  let viewports = $state(VIEWPORT_PRESETS.map((preset) => ({ ...preset })));

  let submitting = $state(false);
  let importing = $state(false);
  let errorMessage = $state<string | null>(null);

  const parsedPaths = $derived(
    pathsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const selectedViewports = $derived(viewports.filter((viewport) => viewport.checked));
  const totalShots = $derived(parsedPaths.length * selectedViewports.length * 2);

  async function importSitemap() {
    if (!baseA) {
      errorMessage = 'Fill in Site A first — its sitemap.xml will be imported.';
      return;
    }
    importing = true;
    errorMessage = null;
    try {
      const response = await fetch('/api/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: baseA })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'sitemap import failed');
      pathsText = body.paths.join('\n');
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'sitemap import failed';
    } finally {
      importing = false;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    submitting = true;
    errorMessage = null;
    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseA,
          baseB,
          paths: parsedPaths,
          viewports: selectedViewports.map(({ name, width, height }) => ({ name, width, height })),
          maskSelectors: maskText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          maxDiffPercent: useThreshold ? maxDiffPercent : undefined
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'failed to start run');
      await goto(resolve('/runs/[id]', { id: String(body.id) }));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'failed to start run';
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>New comparison — webpage-viz-differ</title>
</svelte:head>

<div class="mx-auto max-w-2xl">
  <h1 class="text-center text-2xl font-semibold tracking-tight">Compare two sites</h1>
  <p class="mt-2 text-center text-sm text-slate-600">
    Screenshot the same paths on both origins, diff every pixel, and review what changed. Built for
    framework and platform migrations.
  </p>

  <form onsubmit={submit} class="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6">
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="text-sm font-medium">Site A <span class="text-slate-400">(current)</span></span
        >
        <input
          type="url"
          name="baseA"
          bind:value={baseA}
          required
          placeholder="https://old.example.com"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium"
          >Site B <span class="text-slate-400">(migrated)</span></span
        >
        <input
          type="url"
          name="baseB"
          bind:value={baseB}
          required
          placeholder="https://new.example.com"
          class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>
    </div>

    <div>
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium"
          >Paths <span class="text-slate-400">(one per line)</span></span
        >
        <button
          type="button"
          onclick={importSitemap}
          disabled={importing}
          class="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {importing ? 'Importing…' : 'Import from Site A sitemap'}
        </button>
      </div>
      <textarea
        name="paths"
        bind:value={pathsText}
        rows={6}
        required
        spellcheck="false"
        class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
      ></textarea>
    </div>

    <fieldset>
      <legend class="text-sm font-medium">Viewports</legend>
      <div class="mt-2 flex flex-wrap gap-4">
        {#each viewports as viewport (viewport.name)}
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={viewport.checked} class="rounded" />
            {viewport.name}
            <span class="text-xs text-slate-400">{viewport.width}×{viewport.height}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <details class="rounded-md border border-slate-200 p-3">
      <summary class="cursor-pointer text-sm font-medium text-slate-700">Advanced</summary>
      <div class="mt-3 space-y-4">
        <label class="block">
          <span class="text-sm font-medium">
            Mask selectors <span class="text-slate-400">(one CSS selector per line)</span>
          </span>
          <span class="block text-xs text-slate-500">
            Dynamic regions — dates, ads, chat widgets — are boxed out on both sides before diffing.
          </span>
          <textarea
            bind:value={maskText}
            rows={3}
            spellcheck="false"
            placeholder=".cookie-banner&#10;[data-testid='live-chat']"
            class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
          ></textarea>
        </label>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={useThreshold} class="rounded" />
            Fail pages over
          </label>
          <input
            type="number"
            bind:value={maxDiffPercent}
            min="0"
            max="100"
            step="0.05"
            disabled={!useThreshold}
            class="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
          />
          <span class="text-sm text-slate-500">% diff (otherwise the run is report-only)</span>
        </div>
      </div>
    </details>

    {#if errorMessage}
      <p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
    {/if}

    <button
      type="submit"
      disabled={submitting || parsedPaths.length === 0 || selectedViewports.length === 0}
      class="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {submitting
        ? 'Starting…'
        : `Compare ${parsedPaths.length} ${parsedPaths.length === 1 ? 'path' : 'paths'} (${totalShots} screenshots)`}
    </button>
  </form>
</div>
