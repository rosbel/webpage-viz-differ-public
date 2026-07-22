<script lang="ts">
  import type { RunStatus } from '@webpage-viz-differ/core';
  import { resolve } from '$app/paths';
  import { hostname } from '$lib/format';

  let { data } = $props();

  const statusStyles: Record<RunStatus, string> = {
    completed: 'bg-emerald-50 text-emerald-700',
    running: 'bg-amber-50 text-amber-700',
    failed: 'bg-red-50 text-red-700'
  };

  function formatDate(value: Date): string {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }
</script>

<svelte:head>
  <title>Runs — webpage-viz-differ</title>
</svelte:head>

<h1 class="text-center text-2xl font-semibold tracking-tight">Run history</h1>

{#if data.runs.length === 0}
  <div class="mt-12 text-center text-slate-500">
    <p>No runs yet.</p>
    <a href={resolve('/')} class="mt-2 inline-block text-sm font-medium text-slate-900 underline">
      Start your first comparison
    </a>
  </div>
{:else}
  <div class="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table class="w-full text-sm">
      <thead>
        <tr
          class="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase"
        >
          <th class="px-4 py-3">Run</th>
          <th class="px-4 py-3">Sites</th>
          <th class="px-4 py-3">Started</th>
          <th class="px-4 py-3 text-right">Pages</th>
          <th class="px-4 py-3 text-right">Worst diff</th>
          <th class="px-4 py-3">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each data.runs as run (run.id)}
          <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td class="px-4 py-3">
              <a
                href={resolve('/runs/[id]', { id: String(run.id) })}
                class="font-medium text-slate-900 hover:underline"
              >
                #{run.id}{run.name ? ` · ${run.name}` : ''}
              </a>
            </td>
            <td class="px-4 py-3 text-slate-600">
              {hostname(run.baseA)} <span class="text-slate-400">vs</span>
              {hostname(run.baseB)}
            </td>
            <td class="px-4 py-3 text-slate-600">{formatDate(run.startedAt)}</td>
            <td class="px-4 py-3 text-right tabular-nums">{run.total}</td>
            <td class="px-4 py-3 text-right tabular-nums">
              {run.maxDiffPercent === null ? '—' : `${run.maxDiffPercent.toFixed(2)}%`}
            </td>
            <td class="px-4 py-3">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium {statusStyles[run.status] ??
                  ''}"
              >
                {run.status}
              </span>
              {#if run.errors > 0}
                <span
                  class="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                >
                  {run.errors} errors
                </span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
