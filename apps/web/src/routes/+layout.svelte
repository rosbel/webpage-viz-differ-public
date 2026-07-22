<script lang="ts">
  import '../app.css';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  let { children } = $props();

  const linkClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;
</script>

<div class="min-h-screen">
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-6xl items-center gap-8 px-4 py-3">
      <a href={resolve('/')} class="flex items-baseline gap-2">
        <span class="text-lg font-semibold tracking-tight">webpage-viz-differ</span>
        <span class="hidden text-xs text-slate-500 sm:inline">
          visual comparison between two live sites
        </span>
      </a>
      <nav class="ml-auto flex gap-1">
        <a href={resolve('/')} class={linkClass(page.url.pathname === resolve('/'))}>
          New comparison
        </a>
        <a
          href={resolve('/runs')}
          class={linkClass(page.url.pathname.startsWith(resolve('/runs')))}
        >
          Runs
        </a>
      </nav>
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-4 py-8">
    {@render children()}
  </main>
</div>
