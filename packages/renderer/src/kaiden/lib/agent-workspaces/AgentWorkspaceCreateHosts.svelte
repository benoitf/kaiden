<script lang="ts">
import { faGlobe, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Input } from '@podman-desktop/ui-svelte';
import { Icon } from '@podman-desktop/ui-svelte/icons';

import {
  BLUEPRINT_COLOR_CLASSES,
  HOST_SOURCE_COLORS,
  type HostSource,
  type ReachableHost,
} from './agent-workspace-create-options';

interface Props {
  hosts: ReachableHost[];
  onadd: (host: string) => void;
  onremove: (host: string) => void;
}

let { hosts, onadd, onremove }: Props = $props();

let newHost = $state('');

const legend: { source: HostSource; label: string }[] = [
  { source: 'model', label: 'Model' },
  { source: 'registry', label: 'Registries' },
  { source: 'custom', label: 'Yours' },
];

function onsubmit(event: SubmitEvent): void {
  event.preventDefault();
  const host = newHost.trim();
  if (!host) return;
  if (!hosts.some(h => h.host === host)) onadd(host);
  newHost = '';
}
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <span class="text-sm font-semibold text-[var(--pd-content-card-title)]">Reachable hostnames</span>
    <span class="text-xs text-[var(--pd-content-card-text)] opacity-70">all others blocked</span>
  </div>

  <ul class="flex flex-wrap gap-2" aria-label="Reachable hostnames">
    {#each hosts as entry (entry.host)}
      <li class="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs bg-[var(--pd-content-card-inset-bg)] text-[var(--pd-content-card-title)]">
        <span class="w-1.5 h-1.5 rounded-full {BLUEPRINT_COLOR_CLASSES[HOST_SOURCE_COLORS[entry.source]].bg}" aria-hidden="true"></span>
        {entry.host}
        {#if entry.removable}
          <button
            type="button"
            class="cursor-pointer opacity-60 hover:opacity-100"
            aria-label="Remove {entry.host}"
            onclick={(): void => onremove(entry.host)}>
            <Icon icon={faXmark} size="xs" />
          </button>
        {/if}
      </li>
    {:else}
      <li class="text-xs text-[var(--pd-content-card-text)] opacity-70">No host is reachable.</li>
    {/each}
  </ul>

  <form class="flex items-center gap-2" onsubmit={onsubmit}>
    <Icon icon={faGlobe} size="sm" class="text-[var(--pd-content-card-text)]" />
    <Input
      bind:value={newHost}
      placeholder="Add hostname or wildcard, then press Enter"
      aria-label="Add hostname"
      class="grow font-mono text-sm" />
  </form>

  <div class="flex flex-wrap gap-3 text-xs text-[var(--pd-content-card-text)]">
    {#each legend as item (item.source)}
      <span class="flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full {BLUEPRINT_COLOR_CLASSES[HOST_SOURCE_COLORS[item.source]].bg}" aria-hidden="true"></span>
        {item.label}
      </span>
    {/each}
  </div>
</div>
