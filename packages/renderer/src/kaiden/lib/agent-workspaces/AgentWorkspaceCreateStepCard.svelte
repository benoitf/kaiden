<script lang="ts">
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { Button } from '@podman-desktop/ui-svelte';
import { Icon } from '@podman-desktop/ui-svelte/icons';
import type { Snippet } from 'svelte';

interface Props {
  index: number;
  title: string;
  state: 'done' | 'active' | 'pending';
  summary?: Snippet;
  badge?: string;
  chip?: string;
  hint?: string;
  continueDisabled?: boolean;
  onOpen: () => void;
  onContinue?: () => void;
  onBack?: () => void;
  children: Snippet;
}

let {
  index,
  title,
  state,
  summary,
  badge,
  chip,
  hint,
  continueDisabled = false,
  onOpen,
  onContinue,
  onBack,
  children,
}: Props = $props();

let active = $derived(state === 'active');
</script>

<section
  aria-label={title}
  aria-current={active ? 'step' : undefined}
  class="rounded-xl border bg-[var(--pd-content-card-inset-bg)] transition-colors
    {active ? 'border-[var(--pd-content-card-border-selected)]' : 'border-[var(--pd-content-card-border)]'}">
  {#if active}
    <div class="flex items-center gap-3 px-6 pt-5 pb-4">
      <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold bg-[var(--pd-label-primary-bg)] text-[var(--pd-label-primary-text)]">{index}</span>
      <h2 class="text-lg font-semibold text-[var(--pd-modal-text)]">{title}</h2>
      {#if chip}
        <span class="text-xs px-2 py-0.5 rounded-full bg-[var(--pd-label-primary-bg)] text-[var(--pd-label-primary-text)]">{chip}</span>
      {/if}
      {#if hint}
        <span class="ml-auto text-sm text-[var(--pd-content-card-text)] opacity-70">{hint}</span>
      {/if}
    </div>
  {:else}
    <button
      type="button"
      class="w-full flex items-center gap-3 px-6 py-5 text-left cursor-pointer"
      aria-label="Edit {title}"
      onclick={onOpen}>
      {#if state === 'done'}
        <span class="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--pd-label-tertiary-bg)] text-[var(--pd-label-tertiary-text)]">
          <Icon icon={faCheck} size="xs" />
        </span>
      {:else}
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs border border-[var(--pd-content-card-border)] text-[var(--pd-content-card-text)]">{index}</span>
      {/if}
      <span class="w-48 shrink-0 text-base font-semibold text-[var(--pd-modal-text)]">{title}</span>
      <span class="grow min-w-0 truncate text-sm text-[var(--pd-content-card-text)]">{@render summary?.()}</span>
      {#if badge}
        <span class="text-xs px-2 py-0.5 rounded-md bg-[var(--pd-label-bg)] text-[var(--pd-label-text)]">{badge}</span>
      {:else if state === 'done'}
        <span class="text-sm text-[var(--pd-content-card-text)] opacity-70">Change</span>
      {/if}
      <Icon icon={faChevronDown} size="xs" class="text-[var(--pd-content-card-text)] opacity-70" />
    </button>
  {/if}

  <!-- bodies stay mounted so their effects (model auto-select, secrets loading) keep running -->
  <div class="px-6 pb-5" hidden={!active}>
    {@render children()}
    {#if onContinue ?? onBack}
      <div class="flex gap-3 pt-5">
        {#if onContinue}
          <Button disabled={continueDisabled} onclick={onContinue}>Continue</Button>
        {/if}
        {#if onBack}
          <Button type="secondary" onclick={onBack}>Back</Button>
        {/if}
      </div>
    {/if}
  </div>
</section>
