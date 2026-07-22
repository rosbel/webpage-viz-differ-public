<script lang="ts">
  import type { PageStatus, RunStatus } from '@webpage-viz-differ/core';
  import { hostname } from '$lib/format';
  import { toResultView, type ResultView } from '$lib/result-view';
  import { parseRunStreamEvent } from '$lib/run-stream';

  let { data } = $props();

  const statusStyles: Record<PageStatus, string> = {
    ok: 'bg-emerald-50 text-emerald-700',
    'over-threshold': 'bg-red-50 text-red-700',
    'expected-different': 'bg-amber-50 text-amber-700',
    error: 'bg-red-100 text-red-800'
  };

  // Results and status that arrived over SSE, keyed to the run they belong to
  // so navigating between run pages never shows stale live state. The $effect
  // below claims it for the current run.
  let live = $state<{
    runId: number;
    results: ResultView[];
    status: RunStatus | null;
    error: string | null;
  }>({ runId: -1, results: [], status: null, error: null });
  let selectedKey = $state<string | null>(null);
  let mode = $state<'side' | 'diff' | 'overlay'>('side');
  let overlayOpacity = $state(50);

  $effect(() => {
    if (live.runId !== data.run.id) {
      live = { runId: data.run.id, results: [], status: null, error: null };
      selectedKey = null;
    }
  });

  const results = $derived.by(() => {
    const base = data.results.map(toResultView);
    if (live.runId !== data.run.id) return base;
    const seen = new Set(base.map((result) => result.key));
    return [...base, ...live.results.filter((result) => !seen.has(result.key))];
  });
  const isCurrentLive = $derived(live.runId === data.run.id);
  const runStatus = $derived(isCurrentLive && live.status ? live.status : data.run.status);
  const runError = $derived(isCurrentLive && live.error ? live.error : data.run.error);

  const sorted = $derived(
    [...results].sort((a, b) => {
      if ((a.status === 'error') !== (b.status === 'error')) {
        return a.status === 'error' ? -1 : 1;
      }
      return (b.diffPercent ?? 0) - (a.diffPercent ?? 0);
    })
  );
  const selected = $derived(sorted.find((result) => result.key === selectedKey) ?? sorted[0]);
  const worst = $derived(Math.max(0, ...results.map((result) => result.diffPercent ?? 0)));
  const errorCount = $derived(results.filter((result) => result.status === 'error').length);
  const identicalCount = $derived(results.filter((result) => result.diffPercent === 0).length);

  $effect(() => {
    if (data.run.status !== 'running') return;

    const runId = data.run.id;
    const source = new EventSource(`/api/runs/${runId}/progress`);
    source.onmessage = (message) => {
      if (live.runId !== runId) {
        source.close();
        return;
      }
      const event = parseRunStreamEvent(message.data);
      if (!event) return;
      if (event.type === 'page-completed') {
        const view = toResultView(event.result);
        if (!live.results.some((result) => result.key === view.key)) {
          live.results.push(view);
        }
      } else if (event.type === 'run-finished') {
        live.status = 'completed';
        source.close();
      } else if (event.type === 'run-error') {
        live.status = 'failed';
        live.error = event.message;
        source.close();
      } else if (event.type === 'not-live') {
        live.status = event.status;
        source.close();
      }
    };
    // EventSource reconnects transient failures automatically. Terminal events
    // above close the stream explicitly.
    return () => source.close();
  });

  function imageUrl(relative: string): string {
    return `/api/images/${relative.split('/').map(encodeURIComponent).join('/')}`;
  }
</script>

<svelte:head>
  <title>Run #{data.run.id} — webpage-viz-differ</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">
      Run #{data.run.id}{data.run.name ? ` · ${data.run.name}` : ''}
    </h1>
    <p class="mt-1 text-sm text-slate-600">
      <span class="font-medium">{hostname(data.run.baseA)}</span>
      <span class="text-slate-400">vs</span>
      <span class="font-medium">{hostname(data.run.baseB)}</span>
    </p>
  </div>
  <div class="flex items-center gap-2 text-sm">
    {#if runStatus === 'running'}
      <span
        class="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700"
      >
        <span class="size-2 animate-pulse rounded-full bg-amber-500"></span>
        running {results.length}{data.expectedTotal ? ` / ${data.expectedTotal}` : ''}
      </span>
    {:else if runStatus === 'failed'}
      <span class="rounded-full bg-red-50 px-3 py-1 font-medium text-red-700">failed</span>
    {:else}
      <span class="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700"
        >completed</span
      >
    {/if}
  </div>
</div>

{#if runStatus === 'running' && data.expectedTotal > 0}
  <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200">
    <div
      class="h-full rounded-full bg-slate-900 transition-all"
      style="width: {(results.length / data.expectedTotal) * 100}%"
    ></div>
  </div>
{/if}

{#if runError}
  <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{runError}</p>
{/if}

<div class="mt-6 grid gap-3 sm:grid-cols-4">
  <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <div class="text-xs tracking-wide text-slate-500 uppercase">Pages compared</div>
    <div class="mt-1 text-xl font-semibold tabular-nums">{results.length}</div>
  </div>
  <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <div class="text-xs tracking-wide text-slate-500 uppercase">Pixel-identical</div>
    <div class="mt-1 text-xl font-semibold tabular-nums">{identicalCount}</div>
  </div>
  <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <div class="text-xs tracking-wide text-slate-500 uppercase">Worst diff</div>
    <div class="mt-1 text-xl font-semibold tabular-nums">{worst.toFixed(2)}%</div>
  </div>
  <div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <div class="text-xs tracking-wide text-slate-500 uppercase">Errors</div>
    <div class="mt-1 text-xl font-semibold tabular-nums {errorCount > 0 ? 'text-red-600' : ''}">
      {errorCount}
    </div>
  </div>
</div>

{#if sorted.length === 0}
  <p class="mt-10 text-center text-slate-500">
    {runStatus === 'running' ? 'Capturing first pages…' : 'This run has no results.'}
  </p>
{:else}
  <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
    <div class="self-start overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div
        class="border-b border-slate-200 px-4 py-2 text-xs tracking-wide text-slate-500 uppercase"
      >
        Pages (worst first)
      </div>
      <ul class="max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">
        {#each sorted as result (result.key)}
          <li>
            <button
              type="button"
              onclick={() => (selectedKey = result.key)}
              class="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 {selected?.key ===
              result.key
                ? 'bg-slate-100'
                : ''}"
            >
              <span class="truncate">
                <span class="font-medium">{result.path}</span>
                <span class="ml-1 text-xs text-slate-400">{result.viewport}</span>
              </span>
              {#if result.status === 'error'}
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {statusStyles.error}"
                >
                  error
                </span>
              {:else}
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums {statusStyles[
                    result.status
                  ] ?? ''}"
                >
                  {result.diffPercent?.toFixed(2)}%
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>

    {#if selected}
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div
          class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2"
        >
          <div class="text-sm">
            <span class="font-semibold">{selected.path}</span>
            <span class="ml-1 text-slate-400">@ {selected.viewport}</span>
            {#if selected.diffPercent !== null}
              <span
                class="ml-2 rounded-full px-2 py-0.5 text-xs font-medium {statusStyles[
                  selected.status
                ] ?? ''}"
              >
                {selected.diffPercent.toFixed(2)}% different
              </span>
            {/if}
          </div>
          <div class="flex rounded-md border border-slate-200 text-xs font-medium">
            {#each [['side', 'Side by side'], ['diff', 'Diff'], ['overlay', 'Overlay']] as [value, label] (value)}
              <button
                type="button"
                onclick={() => (mode = value as typeof mode)}
                class="px-3 py-1.5 first:rounded-l-md last:rounded-r-md {mode === value
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'}"
              >
                {label}
              </button>
            {/each}
          </div>
        </div>

        <div class="max-h-[40rem] overflow-auto bg-slate-100 p-4">
          {#if selected.status === 'error'}
            <p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {selected.error ?? 'capture failed'}
            </p>
          {:else if mode === 'side' && selected.a && selected.b}
            <div class="grid gap-4 xl:grid-cols-2">
              <figure>
                <figcaption class="mb-1 text-xs font-medium text-slate-500">
                  A · {hostname(data.run.baseA)}
                </figcaption>
                <img
                  src={imageUrl(selected.a)}
                  alt="Site A: {selected.path}"
                  class="w-full rounded border border-slate-200 bg-white"
                />
              </figure>
              <figure>
                <figcaption class="mb-1 text-xs font-medium text-slate-500">
                  B · {hostname(data.run.baseB)}
                </figcaption>
                <img
                  src={imageUrl(selected.b)}
                  alt="Site B: {selected.path}"
                  class="w-full rounded border border-slate-200 bg-white"
                />
              </figure>
            </div>
          {:else if mode === 'diff' && selected.diff}
            <img
              src={imageUrl(selected.diff)}
              alt="Pixel diff for {selected.path}"
              class="w-full rounded border border-slate-200 bg-white"
            />
          {:else if mode === 'overlay' && selected.a && selected.b}
            <div class="mx-auto max-w-4xl">
              <label class="mb-2 flex items-center gap-3 text-xs font-medium text-slate-600">
                <span>A</span>
                <input type="range" min="0" max="100" bind:value={overlayOpacity} class="flex-1" />
                <span>B</span>
              </label>
              <div class="relative">
                <img
                  src={imageUrl(selected.a)}
                  alt="Site A: {selected.path}"
                  class="w-full rounded border border-slate-200 bg-white"
                />
                <img
                  src={imageUrl(selected.b)}
                  alt="Site B: {selected.path}"
                  class="absolute inset-0 w-full rounded"
                  style="opacity: {overlayOpacity / 100}"
                />
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
