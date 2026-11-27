<script lang="ts" module>
import type { BlueprintColor } from './agent-workspace-create-options';

export interface BlueprintCardInfo {
  id: string;
  label: string;
  value: string;
  color: BlueprintColor;
  chips?: string[];
  /** Name written on the layer of an inside card (e.g. `model`). */
  layer?: string;
}
</script>

<script lang="ts">
import type { Snippet } from 'svelte';

import { BLUEPRINT_COLOR_CLASSES } from './agent-workspace-create-options';
import AgentWorkspaceBlueprintCard from './AgentWorkspaceBlueprintCard.svelte';

interface Props {
  name: string;
  /** Up to four cards for what lives inside the sandbox, top layer first. */
  inside: BlueprintCardInfo[];
  /** Up to four cards for what crosses the sandbox boundary. */
  boundary: BlueprintCardInfo[];
  openCardId?: string;
  editor: Snippet<[string]>;
}

let { name, inside, boundary, openCardId = $bindable(), editor }: Props = $props();

// isometric drawing in a 480x560 box (h-[560px] columns): the boundary cube is L wide, each card row is ROW tall
const WIDTH = 480;
const L = 220;
const ROW = 140;
const COS = Math.cos(Math.PI / 6);

function iso(x: number, y: number, z: number): [number, number] {
  return [WIDTH / 2 + (x - y) * COS, 280 + (x + y) / 2 - z];
}

function points(...corners: [number, number, number][]): string {
  return corners.map(c => iso(...c).join(',')).join(' ');
}

function rowY(index: number): number {
  return ROW / 2 + index * ROW;
}

// layers inside the cube, inset by 30, 36 thick with a gap of 14, bottom layer first
const INSET = 30;
const THICKNESS = 36;
function layerBottom(index: number, count: number): number {
  return 20 + (count - 1 - index) * (THICKNESS + 14);
}

let layers = $derived(
  inside.map((card, index) => {
    const x0 = INSET;
    const x1 = L - INSET;
    const z0 = layerBottom(index, inside.length);
    const z1 = z0 + THICKNESS;
    const [dotX, dotY] = iso(x0 + 20, x1, (z0 + z1) / 2);
    const [labelX, labelY] = iso(x0 + 44, x1, (z0 + z1) / 2 - 4);
    return {
      card,
      top: points([x0, x0, z1], [x1, x0, z1], [x1, x1, z1], [x0, x1, z1]),
      left: points([x0, x1, z1], [x1, x1, z1], [x1, x1, z0], [x0, x1, z0]),
      right: points([x1, x0, z1], [x1, x1, z1], [x1, x1, z0], [x1, x0, z0]),
      dot: [dotX, dotY],
      label: `matrix(${COS},0.5,0,1,${labelX},${labelY})`,
      leader: `0,${rowY(index)} 30,${rowY(index)} ${dotX},${dotY}`,
    };
  }),
);

let columns: { title: string; cards: BlueprintCardInfo[]; align: 'left' | 'right'; order: string }[] = $derived([
  { title: 'Inside the sandbox', cards: inside, align: 'left', order: 'order-1' },
  { title: 'Crosses the boundary', cards: boundary, align: 'right', order: 'order-3' },
]);

let ports = $derived(
  boundary.map((card, index) => {
    const [x, y] = iso(L, 120, 175 - index * 50);
    return { card, dot: [x, y], leader: `${WIDTH},${rowY(index)} ${WIDTH - 30},${rowY(index)} ${x},${y}` };
  }),
);

const boundaryClasses = BLUEPRINT_COLOR_CLASSES.model;

function openCard(id: string): void {
  openCardId = id;
}

function closeCard(): void {
  openCardId = undefined;
}

function onDotKeydown(event: KeyboardEvent, id: string): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openCard(id);
  }
}
</script>

<div class="flex flex-col items-center gap-2">
  <div class="flex items-stretch justify-center w-full">
    {#each columns as column (column.align)}
      <div class="flex flex-col {column.order}">
        <span class="text-xs font-semibold uppercase tracking-widest text-[var(--pd-content-card-text)] opacity-70 mb-2">{column.title}</span>
        <div class="flex flex-col w-80 shrink-0 h-[560px]">
          {#each column.cards as card, index (card.id)}
            <div class="flex items-center h-[140px]">
              <AgentWorkspaceBlueprintCard
                id={card.id}
                label={card.label}
                value={card.value}
                color={card.color}
                chips={card.chips}
                align={column.align}
                above={index >= 2}
                open={openCardId === card.id}
                onopen={(): void => openCard(card.id)}
                onclose={closeCard}>
                {@render editor(card.id)}
              </AgentWorkspaceBlueprintCard>
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <svg
      viewBox="0 0 {WIDTH} {ROW * 4}"
      width={WIDTH}
      height={ROW * 4}
      class="shrink-0 mt-6 fill-none order-2"
      role="group"
      aria-label="Sandbox blueprint">
      <text x={WIDTH / 2} y="40" text-anchor="middle" class="font-mono text-xs {boundaryClasses.fill}">sandbox boundary</text>

      <!-- hidden edges of the boundary -->
      <polyline
        points={points([L, 0, 0], [0, 0, 0], [0, L, 0])}
        class="{boundaryClasses.stroke} opacity-40"
        stroke-dasharray="4 4" />
      <line
        x1={iso(0, 0, 0)[0]}
        y1={iso(0, 0, 0)[1]}
        x2={iso(0, 0, L)[0]}
        y2={iso(0, 0, L)[1]}
        class="{boundaryClasses.stroke} opacity-40"
        stroke-dasharray="4 4" />

      {#each layers as layer (layer.card.id)}
        {@const classes = BLUEPRINT_COLOR_CLASSES[layer.card.color]}
        <polyline points={layer.leader} class="{classes.stroke} opacity-70" />
        <g class="{classes.fill} {classes.stroke}">
          <polygon points={layer.top} fill-opacity="0.25" />
          <polygon points={layer.left} fill-opacity="0.15" />
          <polygon points={layer.right} fill-opacity="0.1" />
        </g>
        {#if layer.card.layer}
          <text transform={layer.label} class="font-mono text-[10px] {classes.fill}">{layer.card.layer}</text>
        {/if}
      {/each}

      <!-- visible faces of the boundary -->
      <g class="{boundaryClasses.stroke} {boundaryClasses.fill}" stroke-width="1.5">
        <polygon points={points([0, 0, L], [L, 0, L], [L, L, L], [0, L, L])} fill-opacity="0.05" />
        <polygon points={points([0, L, L], [L, L, L], [L, L, 0], [0, L, 0])} fill-opacity="0.03" />
        <polygon points={points([L, 0, L], [L, L, L], [L, L, 0], [L, 0, 0])} fill-opacity="0.03" />
      </g>

      {#each ports as port (port.card.id)}
        <polyline points={port.leader} class="{BLUEPRINT_COLOR_CLASSES[port.card.color].stroke} opacity-70" />
      {/each}

      {#each [...layers, ...ports] as item (item.card.id)}
        {@const classes = BLUEPRINT_COLOR_CLASSES[item.card.color]}
        <circle
          cx={item.dot[0]}
          cy={item.dot[1]}
          r="6"
          stroke-width="2"
          class="{classes.stroke} fill-[var(--pd-content-bg)] cursor-pointer"
          role="button"
          tabindex="0"
          aria-label="Configure {item.card.label}"
          onclick={(): void => openCard(item.card.id)}
          onkeydown={(event): void => onDotKeydown(event, item.card.id)} />
      {/each}
    </svg>

  </div>

  <div class="text-center">
    <div class="text-base font-semibold text-[var(--pd-content-card-title)]">{name || 'unnamed workspace'}</div>
    <div class="text-sm text-[var(--pd-content-card-text)] opacity-70">OpenShell sandbox · click any dot or card to configure</div>
  </div>
</div>
