<script lang="ts">
import { faPen } from '@fortawesome/free-solid-svg-icons';
import { Icon } from '@podman-desktop/ui-svelte/icons';
import type { Snippet } from 'svelte';

import { BLUEPRINT_COLOR_CLASSES, type BlueprintColor } from './agent-workspace-create-options';

interface Props {
  id: string;
  label: string;
  value: string;
  color: BlueprintColor;
  chips?: string[];
  /** Side the popover is aligned to. */
  align: 'left' | 'right';
  /** Open the popover above the card instead of below. Defaults to `false`. */
  above?: boolean;
  open: boolean;
  onopen: () => void;
  onclose: () => void;
  children: Snippet;
}

let { id, label, value, color, chips = [], align, above = false, open, onopen, onclose, children }: Props = $props();

let element: HTMLElement | undefined = $state();
let classes = $derived(BLUEPRINT_COLOR_CLASSES[color]);

function toggle(): void {
  if (open) {
    onclose();
  } else {
    onopen();
  }
}

// handled on the card, before the window listener of the page that closes the whole form on Escape
function onkeydown(event: KeyboardEvent): void {
  if (open && event.key === 'Escape') {
    event.stopPropagation();
    onclose();
  }
}

function onmousedown(event: MouseEvent): void {
  if (open && event.target instanceof Node && !element?.contains(event.target)) onclose();
}
</script>

<svelte:window onmousedown={onmousedown} />

<div bind:this={element} class="relative w-full" role="presentation" onkeydown={onkeydown}>
  <div
    class="flex items-center gap-3 rounded-xl border px-4 py-3 bg-[var(--pd-content-card-bg)] transition-colors
      {open ? classes.border : 'border-[var(--pd-content-card-border)]'}">
    <span class="w-2 h-2 rounded-full shrink-0 {classes.bg}" aria-hidden="true"></span>
    <div class="min-w-0 grow">
      <div class="text-xs text-[var(--pd-content-card-text)] opacity-70">{label}</div>
      {#if chips.length > 0}
        <div class="flex flex-wrap gap-1 mt-1">
          {#each chips as chip (chip)}
            <span class="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--pd-label-quaternary-bg)] text-[var(--pd-label-quaternary-text)]">{chip}</span>
          {/each}
        </div>
      {:else}
        <div class="text-sm font-semibold text-[var(--pd-content-card-title)] truncate" title={value}>{value}</div>
      {/if}
    </div>
    <button
      type="button"
      class="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border cursor-pointer
        {open
          ? `${classes.bg} border-transparent text-[var(--pd-content-card-bg)]`
          : 'border-[var(--pd-content-card-border)] text-[var(--pd-content-card-text)] hover:bg-[var(--pd-content-card-hover-inset-bg)]'}"
      aria-label="Edit {label}"
      aria-expanded={open}
      aria-controls="{id}-editor"
      onclick={toggle}>
      <Icon icon={faPen} size="xs" />
    </button>
  </div>

  {#if open}
    <!-- focus the editor so Escape reaches the card even when opened from a blueprint dot -->
    <!-- svelte-ignore a11y_autofocus -->
    <div
      id="{id}-editor"
      tabindex="-1"
      autofocus
      role="dialog"
      aria-label={label}
      class="absolute z-20 w-[36rem] max-h-[32rem] overflow-y-auto rounded-xl border p-4 shadow-xl
        bg-[var(--pd-content-card-bg)] border-[var(--pd-content-card-border)]
        {align === 'left' ? 'left-0' : 'right-0'} {above ? 'bottom-full mb-2' : 'top-full mt-2'}">
      {@render children()}
    </div>
  {/if}
</div>
