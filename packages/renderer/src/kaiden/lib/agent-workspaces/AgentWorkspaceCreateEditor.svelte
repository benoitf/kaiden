<script lang="ts">
import { faPuzzlePiece } from '@fortawesome/free-solid-svg-icons';
import { toast } from 'svelte-sonner';

import { wizard } from '/@/kaiden/stores/agent-workspace-create-draft.svelte';
import { mcpRemoteServerInfos } from '/@/kaiden/stores/mcp-remote-servers';
import { ragEnvironments } from '/@/kaiden/stores/rag-environments';
import { skillInfos } from '/@/kaiden/stores/skills';
import { workspaceProjectInfos } from '/@/kaiden/stores/workspace-projects';
import type { ChecklistItem } from '/@/lib/ui/ChecklistPanel.svelte';
import ChecklistPanel from '/@/lib/ui/ChecklistPanel.svelte';
import { providerInfos } from '/@/stores/providers';
import { sanitizeDns1123Label } from '/@api/agent-workspace-info';
import type { WorkspaceProjectInfo } from '/@api/workspace-project-info';

import { getDefaultSessionName, type ReachableHost } from './agent-workspace-create-options';
import AgentWorkspaceCreateHosts from './AgentWorkspaceCreateHosts.svelte';
import AgentWorkspaceCreateStepAgentModel from './AgentWorkspaceCreateStepAgentModel.svelte';
import type { CustomMount } from './AgentWorkspaceCreateStepFileSystem.svelte';
import AgentWorkspaceCreateStepFileSystem from './AgentWorkspaceCreateStepFileSystem.svelte';
import AgentWorkspaceCreateStepToolsSecrets from './AgentWorkspaceCreateStepToolsSecrets.svelte';
import AgentWorkspaceCreateStepWorkspace from './AgentWorkspaceCreateStepWorkspace.svelte';

interface Props {
  /** Id of the blueprint card being edited. */
  id: string;
  secretItems: ChecklistItem[];
  addonItems: ChecklistItem[];
  reachableHosts: ReachableHost[];
  onProjectSelect: (project: WorkspaceProjectInfo | undefined) => void;
}

let { id, secretItems, addonItems, reachableHosts, onProjectSelect }: Props = $props();

const toolSections: Record<string, ('skills' | 'mcp' | 'secrets' | 'knowledge')[]> = {
  agent: ['skills'],
  mcp: ['mcp', 'knowledge'],
  credentials: ['secrets'],
};

const agentModelSections = ['model', 'agent', 'image'] as const;
let agentModelSection = $derived(agentModelSections.find(section => section === id));

let skillItems: ChecklistItem[] = $derived(
  $skillInfos
    .filter(s => s.enabled)
    .map(s => ({
      id: s.name,
      name: s.name,
      description: s.description,
      group: s.managed ? 'Custom' : 'Pre-built',
    })),
);
let mcpItems: ChecklistItem[] = $derived(
  $mcpRemoteServerInfos.map(m => ({ id: m.id, name: m.name, description: m.description })),
);
let knowledgeItems: ChecklistItem[] = $derived(
  $ragEnvironments
    .filter(r => r.mcpServer)
    .map(r => {
      const sourceCount = r.files.length;
      const sourcesLabel = sourceCount > 0 ? `${sourceCount} source${sourceCount !== 1 ? 's' : ''}` : '';
      const providerName =
        $providerInfos.find(p => p.id === r.ragConnection?.providerId)?.name ?? r.ragConnection?.providerId;
      return {
        id: r.name,
        name: r.name,
        description: [providerName, sourcesLabel].filter(Boolean).join(' · '),
      };
    }),
);

function addCustomMount(): void {
  wizard.draft.customMounts = [...wizard.draft.customMounts, { host: '', target: '', ro: false }];
}

function removeCustomMount(index: number): void {
  if (wizard.draft.customMounts.length <= 1) return;
  wizard.draft.customMounts = wizard.draft.customMounts.filter((_, i) => i !== index);
}

function updateCustomMount(index: number, field: keyof CustomMount, value: string | boolean): void {
  wizard.draft.customMounts = wizard.draft.customMounts.map((m, i) => (i === index ? { ...m, [field]: value } : m));
}

function setHosts(hosts: string[]): void {
  wizard.draft.hostsByMode = { ...wizard.draft.hostsByMode, [wizard.draft.selectedNetwork]: hosts };
}

function addHost(host: string): void {
  const current = (wizard.draft.hostsByMode[wizard.draft.selectedNetwork] ?? []).filter(h => h.trim() !== '');
  setHosts([...current, host]);
}

function removeHost(host: string): void {
  setHosts((wizard.draft.hostsByMode[wizard.draft.selectedNetwork] ?? []).filter(h => h.trim() !== host));
}

async function browseDirectory(title: string): Promise<string | undefined> {
  try {
    const result = await window.openDialog({ title, selectors: ['openDirectory'] });
    return result?.[0];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to browse for directory', err);
    toast.error(`Failed to browse for directory: ${message}`);
    return undefined;
  }
}

async function handleBrowseCustomPath(index: number): Promise<void> {
  const selected = await browseDirectory('Select a directory');
  if (selected) updateCustomMount(index, 'host', selected);
}

async function handleBrowseSource(): Promise<void> {
  const selected = await browseDirectory('Select a working directory');
  if (!selected) return;
  wizard.draft.sourcePath = selected;
  if (!wizard.draft.nameManuallyEdited) {
    const lastSegment = getDefaultSessionName(selected);
    if (lastSegment) wizard.draft.sessionName = sanitizeDns1123Label(lastSegment);
  }
}
</script>

<div class="flex flex-col gap-6">
  {#if agentModelSection}
    <AgentWorkspaceCreateStepAgentModel
      section={agentModelSection}
      bind:selectedAgent={wizard.draft.selectedAgent}
      bind:selectedModel={wizard.draft.selectedModel}
      bind:customImage={wizard.draft.customImage} />
  {/if}

  {#if toolSections[id]}
    <AgentWorkspaceCreateStepToolsSecrets
      sections={toolSections[id]}
      {skillItems}
      bind:selectedSkillIds={wizard.draft.selectedSkillIds}
      {mcpItems}
      bind:selectedMcpIds={wizard.draft.selectedMcpIds}
      {secretItems}
      bind:selectedSecretIds={wizard.draft.selectedSecretIds}
      {knowledgeItems}
      bind:selectedKnowledgeIds={wizard.draft.selectedKnowledgeIds} />
  {/if}

  {#if id === 'addons'}
    <ChecklistPanel
      title="Add-ons"
      subtitle="Tools installed in the sandbox next to the agent"
      icon={faPuzzlePiece}
      items={addonItems}
      bind:selected={wizard.draft.selectedAddonIds}
      emptyMessage="No add-on available." />
  {:else if id === 'folders'}
    <AgentWorkspaceCreateStepWorkspace
      bind:sourcePath={wizard.draft.sourcePath}
      bind:projectOpen={wizard.draft.projectOpen}
      onBrowseSource={handleBrowseSource}
      configExists={wizard.draft.configExists}
      bind:configAction={wizard.draft.configAction}
      projects={[...$workspaceProjectInfos]}
      selectedProjectId={wizard.draft.selectedProjectId}
      {onProjectSelect} />
    <AgentWorkspaceCreateStepFileSystem
      bind:selectedFileAccess={wizard.draft.selectedFileAccess}
      customMounts={wizard.draft.customMounts}
      onBrowseCustomPath={handleBrowseCustomPath}
      onAddCustomMount={addCustomMount}
      onRemoveCustomMount={removeCustomMount}
      onUpdateCustomMount={updateCustomMount} />
  {:else if id === 'hosts'}
    <AgentWorkspaceCreateHosts hosts={reachableHosts} onadd={addHost} onremove={removeHost} />
  {/if}
</div>
