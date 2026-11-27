/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import { stringify } from 'yaml';

import type { CustomMount } from '/@/kaiden/lib/agent-workspaces/AgentWorkspaceCreateStepFileSystem.svelte';
import { getModelId } from '/@/kaiden/lib/models/models-utils';
import {
  WORKSPACE_REGISTRY_HOSTS,
  type WorkspaceCreateDraft,
} from '/@/kaiden/stores/agent-workspace-create-draft.svelte';
import {
  type AgentWorkspaceConfiguration,
  type AgentWorkspaceCreateOptions,
  type AgentWorkspaceMount,
  getSandboxNameValidationError,
  type NetworkConfiguration,
} from '/@api/agent-workspace-info';
import type { MCPRemoteServerInfo } from '/@api/mcp/mcp-server-info';
import type { SkillInfo } from '/@api/skill/skill-info';

export interface CreateOptionsContext {
  skills: readonly SkillInfo[];
  mcpServers: readonly MCPRemoteServerInfo[];
  workspaceConfiguration?: AgentWorkspaceConfiguration;
}

export type HostSource = 'model' | 'registry' | 'custom';

export interface ReachableHost {
  host: string;
  source: HostSource;
  /** true when the host comes from the draft host list and can be removed by the user */
  removable: boolean;
}

export function getDefaultSessionName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}

export function getEffectiveWorkspaceName(draft: WorkspaceCreateDraft): string {
  const trimmed = draft.sessionName.trim();
  if (draft.nameManuallyEdited) return trimmed;
  return trimmed || getDefaultSessionName(draft.sourcePath);
}

/** Error of the workspace name, `undefined` when valid or still empty and untouched. */
export function getWorkspaceNameError(
  draft: WorkspaceCreateDraft,
  sandboxes: readonly { gatewayName: string; name: string }[],
): string | undefined {
  const name = getEffectiveWorkspaceName(draft);
  if (!name && !draft.nameManuallyEdited) return undefined;
  const error = getSandboxNameValidationError(name);
  if (error) return error;
  const lower = name.toLowerCase();
  if (sandboxes.some(s => s.gatewayName === draft.selectedGateway && s.name.toLowerCase() === lower)) {
    return 'A workspace with this name already exists. Please choose a different name.';
  }
  return undefined;
}

/** Hosts of the current network mode, without the empty placeholder rows. */
export function getDraftHosts(draft: WorkspaceCreateDraft): string[] {
  return (draft.hostsByMode[draft.selectedNetwork] ?? []).map(h => h.trim()).filter(h => h !== '');
}

export function buildNetwork(draft: WorkspaceCreateDraft): NetworkConfiguration | undefined {
  if (draft.selectedNetwork !== 'registries' && draft.selectedNetwork !== 'blocked') {
    return undefined;
  }
  const hosts = getDraftHosts(draft);
  return { mode: 'deny', hosts: hosts.length ? hosts : undefined };
}

export function buildMounts(fileAccess: string, mounts: CustomMount[]): AgentWorkspaceMount[] | undefined {
  if (fileAccess !== 'custom') {
    return undefined;
  }
  const filtered = mounts
    .filter(m => m.host.trim() !== '')
    .map(m => {
      const host = m.host.trim();
      const trimmedTarget = m.target.trim();
      const basename = host.split(/[\\/]/).filter(Boolean).pop();
      const target = trimmedTarget !== '' ? trimmedTarget : (basename ?? host);
      return { host, target, ro: m.ro };
    });
  return filtered.length > 0 ? filtered : undefined;
}

function normalizeTildeToHome(p: string): string {
  return p.startsWith('~/') ? `$HOME/${p.slice(2)}` : p;
}

function normalizeWorkspaceConfiguration(
  config: AgentWorkspaceConfiguration | undefined,
): AgentWorkspaceConfiguration | undefined {
  if (!config?.mounts) return config;
  return {
    ...config,
    mounts: config.mounts.map(m => ({
      ...m,
      host: normalizeTildeToHome(m.host),
      target: normalizeTildeToHome(m.target),
    })),
  };
}

/** Builds the options sent to `createAgentWorkspace`, or `undefined` while no model is selected. */
export function buildCreateOptions(
  draft: WorkspaceCreateDraft,
  ctx: CreateOptionsContext,
): AgentWorkspaceCreateOptions | undefined {
  if (!draft.selectedModel) {
    return undefined;
  }
  const skillPaths = ctx.skills.filter(s => draft.selectedSkillIds.includes(s.name)).map(s => s.path);

  const selectedMcp = ctx.mcpServers.filter(m => draft.selectedMcpIds.includes(m.id));
  const servers = selectedMcp
    .filter(m => m.setupType === 'remote' || (!m.setupType && m.url))
    .map(m => ({ name: m.name, url: m.url }));
  const commands = selectedMcp.flatMap(m =>
    m.setupType === 'package' && m.commandSpec
      ? [{ name: m.name, command: m.commandSpec.command, args: m.commandSpec.args, env: m.commandSpec.env }]
      : [],
  );
  const hasMcp = servers.length > 0 || commands.length > 0;

  return {
    sourcePath: draft.sourcePath.trim() || undefined,
    agent: draft.selectedAgent,
    image: draft.customImage.trim() || undefined,
    model: getModelId(draft.selectedModel),
    gateway: draft.selectedGateway,
    name: draft.sessionName.trim() || getDefaultSessionName(draft.sourcePath),
    description: draft.description || undefined,
    skills: skillPaths.length > 0 ? skillPaths : undefined,
    network: buildNetwork(draft),
    secrets: draft.selectedSecretIds.length > 0 ? [...draft.selectedSecretIds] : undefined,
    mounts: buildMounts(draft.selectedFileAccess, draft.customMounts),
    mcp: hasMcp
      ? {
          ...(servers.length > 0 ? { servers } : {}),
          ...(commands.length > 0 ? { commands } : {}),
        }
      : undefined,
    workspaceConfiguration: normalizeWorkspaceConfiguration(ctx.workspaceConfiguration),
    replaceConfig: draft.configExists && draft.configAction === 'replace' ? true : undefined,
    project: draft.selectedProjectId,
    addons: draft.selectedAddonIds.length > 0 ? [...draft.selectedAddonIds] : undefined,
  };
}

export interface FoldersSummary {
  mounted: number;
  writable: number;
}

export function summarizeFolders(draft: WorkspaceCreateDraft): FoldersSummary {
  const mounts = buildMounts(draft.selectedFileAccess, draft.customMounts) ?? [];
  const source = draft.sourcePath.trim() ? 1 : 0;
  return {
    mounted: source + mounts.length,
    writable: source + mounts.filter(m => !m.ro).length,
  };
}

export function formatFoldersSummary({ mounted, writable }: FoldersSummary): string {
  if (mounted === 0) return 'No host folder';
  return `${mounted} mounted · ${writable} writable`;
}

/** Joins names for a card value, collapsing the tail: `a, b +2`. */
export function formatNames(names: string[], empty: string, max = 2): string {
  if (names.length === 0) return empty;
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname || undefined;
  } catch (err: unknown) {
    console.debug(`ignoring invalid url '${url}' for reachable hosts`, err);
    return undefined;
  }
}

/**
 * Hosts the sandbox can reach, deduplicated (first origin wins): the model endpoint, always allowed by the
 * gateway policy, then the listed hosts.
 */
export function getReachableHosts(draft: WorkspaceCreateDraft): ReachableHost[] {
  const entries: ReachableHost[] = [];
  const modelHost = hostOf(draft.selectedModel?.endpoint);
  if (modelHost) entries.push({ host: modelHost, source: 'model', removable: false });
  for (const host of getDraftHosts(draft)) {
    const source = WORKSPACE_REGISTRY_HOSTS.includes(host) ? 'registry' : 'custom';
    entries.push({ host, source, removable: true });
  }
  return entries.filter((entry, i) => entries.findIndex(e => e.host === entry.host) === i);
}

export function toYaml(options: AgentWorkspaceCreateOptions | undefined): string {
  if (!options) return '# select a model to preview the workspace configuration\n';
  // drop undefined members so the preview only lists what is configured
  return stringify(JSON.parse(JSON.stringify(options)));
}

export type BlueprintColor = 'model' | 'agent' | 'addons' | 'image' | 'custom';

/** Static class names (scanned by Tailwind) of each blueprint color. */
export const BLUEPRINT_COLOR_CLASSES: Record<
  BlueprintColor,
  { bg: string; stroke: string; fill: string; border: string }
> = {
  model: {
    bg: 'bg-[var(--pd-blueprint-model)]',
    stroke: 'stroke-[var(--pd-blueprint-model)]',
    fill: 'fill-[var(--pd-blueprint-model)]',
    border: 'border-[var(--pd-blueprint-model)]',
  },
  agent: {
    bg: 'bg-[var(--pd-blueprint-agent)]',
    stroke: 'stroke-[var(--pd-blueprint-agent)]',
    fill: 'fill-[var(--pd-blueprint-agent)]',
    border: 'border-[var(--pd-blueprint-agent)]',
  },
  addons: {
    bg: 'bg-[var(--pd-blueprint-addons)]',
    stroke: 'stroke-[var(--pd-blueprint-addons)]',
    fill: 'fill-[var(--pd-blueprint-addons)]',
    border: 'border-[var(--pd-blueprint-addons)]',
  },
  image: {
    bg: 'bg-[var(--pd-blueprint-image)]',
    stroke: 'stroke-[var(--pd-blueprint-image)]',
    fill: 'fill-[var(--pd-blueprint-image)]',
    border: 'border-[var(--pd-blueprint-image)]',
  },
  custom: {
    bg: 'bg-[var(--pd-blueprint-custom)]',
    stroke: 'stroke-[var(--pd-blueprint-custom)]',
    fill: 'fill-[var(--pd-blueprint-custom)]',
    border: 'border-[var(--pd-blueprint-custom)]',
  },
};

export const HOST_SOURCE_COLORS: Record<HostSource, BlueprintColor> = {
  model: 'model',
  registry: 'addons',
  custom: 'custom',
};
