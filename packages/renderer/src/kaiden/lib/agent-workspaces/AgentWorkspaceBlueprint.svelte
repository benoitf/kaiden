<script lang="ts">
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { Button } from '@podman-desktop/ui-svelte';
import { Icon } from '@podman-desktop/ui-svelte/icons';

interface Props {
  name: string;
  image: string;
  agent: string;
  model: string;
  addonCount: number;
  mcpCount: number;
  folderCount: number;
  writableCount: number;
  hostCount: number;
  activeStepId: string;
  canCreate: boolean;
  readyMessage: string;
  onSelectStep: (stepId: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}

let {
  name,
  image,
  agent,
  model,
  addonCount,
  mcpCount,
  folderCount,
  writableCount,
  hostCount,
  activeStepId,
  canCreate,
  readyMessage,
  onSelectStep,
  onCreate,
  onCancel,
}: Props = $props();

const CX = 320;
const W = 120;
const H = 60;
const T = 22;

// stacked isometric slabs, top to bottom; colors come from the label tokens of the color registry
let layers = $derived([
  { stepId: 'model', title: 'Model', value: model, y: 150, tone: 'primary', empty: false },
  { stepId: 'agent', title: 'Agent', value: agent, y: 200, tone: 'quaternary', empty: false },
  {
    stepId: 'addons',
    title: 'Add-ons',
    value: addonCount ? `${addonCount} selected` : '+ add',
    y: 250,
    tone: 'tertiary',
    empty: addonCount === 0,
  },
  { stepId: 'image', title: 'Image', value: image, y: 300, tone: 'secondary', empty: false },
]);

let sideLabels = $derived([
  { stepId: 'mcp', title: 'MCP servers', value: mcpCount ? `${mcpCount} attached` : '+ add', y: 150 },
  {
    stepId: 'folders',
    title: 'Folders',
    value: folderCount ? `${folderCount} · ${writableCount} writable` : 'none',
    y: 240,
  },
  { stepId: 'hostnames', title: 'Hostnames', value: `${hostCount} allowed`, y: 320 },
]);

const TONE_CLASSES: Record<string, string> = {
  primary: 'fill-[var(--pd-label-primary-bg)] stroke-[var(--pd-label-primary-text)]',
  secondary: 'fill-[var(--pd-label-secondary-bg)] stroke-[var(--pd-label-secondary-text)]',
  tertiary: 'fill-[var(--pd-label-tertiary-bg)] stroke-[var(--pd-label-tertiary-text)]',
  quaternary: 'fill-[var(--pd-label-quaternary-bg)] stroke-[var(--pd-label-quaternary-text)]',
};

function top(y: number): string {
  return `${CX},${y - H} ${CX + W},${y} ${CX},${y + H} ${CX - W},${y}`;
}
function left(y: number): string {
  return `${CX - W},${y} ${CX},${y + H} ${CX},${y + H + T} ${CX - W},${y + T}`;
}
function right(y: number): string {
  return `${CX},${y + H} ${CX + W},${y} ${CX + W},${y + T} ${CX},${y + H + T}`;
}

function onKey(event: KeyboardEvent, stepId: string): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelectStep(stepId);
  }
}
</script>

<aside aria-label="Blueprint" class="flex flex-col gap-4 h-full">
  <div>
    <p class="text-xs font-semibold uppercase tracking-widest text-[var(--pd-content-card-text)] opacity-70">Blueprint</p>
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="text-xl font-semibold text-[var(--pd-modal-text)]">What this workspace contains</h2>
      <span class="text-xs text-[var(--pd-content-card-text)] opacity-70">Click a label or a layer to edit it</span>
    </div>
  </div>

  <div class="rounded-xl border border-[var(--pd-content-card-border)] bg-[var(--pd-content-card-inset-bg)] p-2">
    <svg viewBox="0 0 640 460" class="w-full h-auto" role="group" aria-label="Workspace layers">
      <!-- sandbox boundary -->
      <g class="fill-none stroke-[var(--pd-label-primary-text)]" stroke-width="1.5">
        <polygon points="{CX},40 {CX + 160},120 {CX},200 {CX - 160},120" />
        <line x1={CX - 160} y1="120" x2={CX - 160} y2="340" />
        <line x1={CX + 160} y1="120" x2={CX + 160} y2="340" />
        <line x1={CX} y1="200" x2={CX} y2="420" />
        <polyline points="{CX - 160},340 {CX},420 {CX + 160},340" />
        <line x1={CX} y1="40" x2={CX} y2="260" stroke-dasharray="4 4" opacity="0.5" />
      </g>
      <text x={CX} y="28" text-anchor="middle" class="fill-[var(--pd-label-primary-text)] font-mono text-xs">sandbox boundary</text>

      {#each layers.toReversed() as layer (layer.stepId)}
        {@const isActive = activeStepId === layer.stepId}
        <g
          role="button"
          tabindex="0"
          aria-label="Edit {layer.title}"
          class="cursor-pointer {TONE_CLASSES[layer.tone]}"
          stroke-width={isActive ? 2.5 : 1}
          fill-opacity={isActive ? 0.95 : 0.6}
          stroke-dasharray={layer.empty ? '5 4' : undefined}
          onclick={(): void => onSelectStep(layer.stepId)}
          onkeydown={(e): void => onKey(e, layer.stepId)}>
          <polygon points={left(layer.y)} />
          <polygon points={right(layer.y)} />
          <polygon points={top(layer.y)} />
        </g>
      {/each}

      {#each layers as layer (layer.stepId)}
        {@const isActive = activeStepId === layer.stepId}
        <g
          role="button"
          tabindex="0"
          aria-label="Edit {layer.title} label"
          class="cursor-pointer"
          onclick={(): void => onSelectStep(layer.stepId)}
          onkeydown={(e): void => onKey(e, layer.stepId)}>
          <line x1="152" y1={layer.y + 4} x2={CX - W} y2={layer.y + 4} class="stroke-[var(--pd-content-card-text)]" stroke-opacity="0.5" />
          <circle cx={CX - W} cy={layer.y + 4} r="3" class={TONE_CLASSES[layer.tone]} />
          <text x="146" y={layer.y - 8} text-anchor="end" class="fill-[var(--pd-content-card-text)] text-xs">
            {layer.title}{isActive ? ' · editing' : ''}
          </text>
          <text x="146" y={layer.y + 10} text-anchor="end" class="fill-[var(--pd-modal-text)] text-sm font-semibold">{layer.value}</text>
        </g>
      {/each}

      {#each sideLabels as label (label.stepId)}
        <g
          role="button"
          tabindex="0"
          aria-label="Edit {label.title}"
          class="cursor-pointer"
          onclick={(): void => onSelectStep(label.stepId)}
          onkeydown={(e): void => onKey(e, label.stepId)}>
          <line x1={CX + W - 10} y1={label.y + 4} x2="488" y2={label.y + 4} class="stroke-[var(--pd-content-card-text)]" stroke-opacity="0.5" stroke-dasharray="3 3" />
          <circle cx={CX + W - 10} cy={label.y + 4} r="3" class="fill-[var(--pd-label-tertiary-text)]" />
          <text x="494" y={label.y - 8} class="fill-[var(--pd-content-card-text)] text-xs">
            {label.title}{activeStepId === label.stepId ? ' · editing' : ''}
          </text>
          <text x="494" y={label.y + 10} class="fill-[var(--pd-modal-text)] text-sm font-semibold">{label.value}</text>
        </g>
      {/each}

      <text x="630" y="452" text-anchor="end" class="fill-[var(--pd-label-primary-text)] font-mono text-xs">
        {name || 'unnamed'} · OpenShell · draft
      </text>
    </svg>
  </div>

  <div class="grid grid-cols-3 gap-3">
    <div class="rounded-xl border border-[var(--pd-content-card-border)] px-4 py-3">
      <p class="text-2xl text-[var(--pd-modal-text)]">{mcpCount} <span class="text-sm">MCP</span></p>
      <p class="text-sm text-[var(--pd-content-card-text)] opacity-70">servers</p>
    </div>
    <div class="rounded-xl border border-[var(--pd-content-card-border)] px-4 py-3">
      <p class="text-2xl text-[var(--pd-modal-text)]">{folderCount} <span class="text-sm">folder{folderCount === 1 ? '' : 's'}</span></p>
      <p class="text-sm text-[var(--pd-content-card-text)] opacity-70">{writableCount} writable</p>
    </div>
    <div class="rounded-xl border border-[var(--pd-content-card-border)] px-4 py-3">
      <p class="text-2xl text-[var(--pd-modal-text)]">{hostCount} <span class="text-sm">host{hostCount === 1 ? '' : 's'}</span></p>
      <p class="text-sm text-[var(--pd-content-card-text)] opacity-70">outbound</p>
    </div>
  </div>

  <ul class="grid grid-cols-2 gap-2 text-sm text-[var(--pd-content-card-text)]">
    <li class="flex items-center gap-2">
      <Icon icon={faCheck} size="xs" class="text-[var(--pd-label-tertiary-text)]" />
      <span><strong class="text-[var(--pd-modal-text)]">Filesystem</strong> {folderCount} mounted folder{folderCount === 1 ? '' : 's'}</span>
    </li>
    <li class="flex items-center gap-2">
      <Icon icon={faCheck} size="xs" class="text-[var(--pd-label-tertiary-text)]" />
      <span><strong class="text-[var(--pd-modal-text)]">Network</strong> deny by default</span>
    </li>
    <li class="flex items-center gap-2">
      <Icon icon={faCheck} size="xs" class="text-[var(--pd-label-tertiary-text)]" />
      <span><strong class="text-[var(--pd-modal-text)]">Credentials</strong> held by the gateway</span>
    </li>
  </ul>

  <div class="mt-auto flex flex-col gap-2">
    <p class="text-center text-sm text-[var(--pd-content-card-text)] opacity-70">{readyMessage}</p>
    <div class="flex gap-3">
      <Button type="secondary" onclick={onCancel}>Cancel</Button>
      <Button class="grow" disabled={!canCreate} onclick={onCreate} title="Create workspace (⌘↵)">Create workspace</Button>
    </div>
  </div>
</aside>
