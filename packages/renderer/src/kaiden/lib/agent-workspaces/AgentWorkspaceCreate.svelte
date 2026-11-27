<script lang="ts">
import { faPen, faServer, faTerminal } from '@fortawesome/free-solid-svg-icons';
import { Icon } from '@podman-desktop/ui-svelte/icons';
import { onMount, untrack } from 'svelte';
import { toast } from 'svelte-sonner';

import { getModelId } from '/@/kaiden/lib/models/models-utils';
import {
  applyProjectToDraft,
  applyYamlToDraft,
  draftToYaml,
  resetDraft,
  wizard,
  WORKSPACE_REGISTRY_HOSTS,
} from '/@/kaiden/stores/agent-workspace-create-draft.svelte';
import { agentInfos } from '/@/kaiden/stores/agents';
import { mcpRemoteServerInfos } from '/@/kaiden/stores/mcp-remote-servers';
import { disabledModels, isModelEnabled, modelKey } from '/@/kaiden/stores/model-catalog';
import { catalogModels } from '/@/kaiden/stores/models';
import { openshellGateways } from '/@/kaiden/stores/openshell-gateways';
import { allOpenshellSandboxes } from '/@/kaiden/stores/openshell-sandboxes';
import { ragEnvironments } from '/@/kaiden/stores/rag-environments';
import { secretVaultInfos } from '/@/kaiden/stores/secret-vault';
import { skillInfos } from '/@/kaiden/stores/skills';
import { workspaceProjectInfos } from '/@/kaiden/stores/workspace-projects';
import IconImage from '/@/lib/appearance/IconImage.svelte';
import MonacoEditor from '/@/lib/editor/MonacoEditor.svelte';
import type { ChecklistItem } from '/@/lib/ui/ChecklistPanel.svelte';
import ChecklistPanel from '/@/lib/ui/ChecklistPanel.svelte';
import FormPage from '/@/lib/ui/FormPage.svelte';
import { handleNavigation } from '/@/navigation';
import { providerInfos } from '/@/stores/providers';
import type {
  AgentWorkspaceConfiguration,
  AgentWorkspaceMount,
  NetworkConfiguration,
} from '/@api/agent-workspace-info';
import { getSandboxNameValidationError, sanitizeDns1123Label } from '/@api/agent-workspace-info';
import type { ModelInfo } from '/@api/model-registry-info';
import { NavigationPage } from '/@api/navigation-page';
import type { DefaultWorkspaceSettings } from '/@api/onboarding-settings-info';
import { isUsableGateway } from '/@api/openshell-gateway-info';
import type { WorkspaceProjectInfo } from '/@api/workspace-project-info';

import AgentWorkspaceBlueprint from './AgentWorkspaceBlueprint.svelte';
import AgentWorkspaceCreateStepAgentModel from './AgentWorkspaceCreateStepAgentModel.svelte';
import AgentWorkspaceCreateStepCard from './AgentWorkspaceCreateStepCard.svelte';
import type { CustomMount } from './AgentWorkspaceCreateStepFileSystem.svelte';
import AgentWorkspaceCreateStepFileSystem from './AgentWorkspaceCreateStepFileSystem.svelte';
import AgentWorkspaceCreateStepNetworking from './AgentWorkspaceCreateStepNetworking.svelte';
import AgentWorkspaceCreateStepToolsSecrets from './AgentWorkspaceCreateStepToolsSecrets.svelte';
import AgentWorkspaceCreateStepWorkspace from './AgentWorkspaceCreateStepWorkspace.svelte';

function mapNetworkSelection(value: string, hosts: string[]): NetworkConfiguration | undefined {
  const filtered = hosts.filter(h => h.trim() !== '');
  switch (value) {
    case 'registries':
    case 'blocked':
      return { mode: 'deny', hosts: filtered.length ? filtered : undefined };
    default:
      return undefined;
  }
}

const wizardSteps = [
  { id: 'image', title: 'Base image' },
  { id: 'agent', title: 'Agent' },
  { id: 'model', title: 'Model' },
  { id: 'addons', title: 'Add-ons' },
  { id: 'mcp', title: 'MCP servers' },
  { id: 'folders', title: 'Folders' },
  { id: 'hostnames', title: 'Reachable hostnames' },
];
// steps after this index have usable defaults, so the workspace can be created without visiting them
const LAST_REQUIRED_STEP_INDEX = 2;

function clearProject(): void {
  wizard.draft.selectedProjectId = undefined;
  wizard.draft.sourcePath = '';
  wizard.draft.sessionName = '';
  wizard.draft.nameManuallyEdited = false;
  wizard.draft.selectedSkillIds = $skillInfos.filter(s => s.enabled).map(s => s.name);
  wizard.draft.selectedMcpIds = $mcpRemoteServerInfos.map(m => m.id);
  wizard.draft.selectedSecretIds = $secretVaultInfos.map(s => s.id);
  wizard.draft.selectedKnowledgeIds = $ragEnvironments.filter(r => r.mcpServer).map(r => r.name);
  wizard.draft.selectedFileAccess = 'workspace';
  wizard.draft.selectedNetwork = 'registries';
  wizard.draft.customMounts = [{ host: '', target: '', ro: false }];
  wizard.draft.hostsByMode = { registries: [...WORKSPACE_REGISTRY_HOSTS], blocked: [''] };
  wizard.draft.customImage = '';
}

function handleProjectSelect(project: WorkspaceProjectInfo | undefined): void {
  if (project) {
    applyProjectToDraft(project);
  } else {
    clearProject();
  }
}

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

// --- Form state (backed by persistent draft store) ---
let defaultSettings = $state<DefaultWorkspaceSettings | undefined>(undefined);

onMount(async () => {
  defaultSettings = await window.getConfigurationValue<DefaultWorkspaceSettings>('onboarding.defaultWorkspaceSettings');

  if (!wizard.draft.initialized) {
    const defaultAgent = defaultSettings?.defaultAgent;
    if (defaultAgent && $agentInfos.some(a => a.id === defaultAgent)) {
      wizard.draft.selectedAgent = defaultAgent;
    }

    if (
      defaultAgent &&
      defaultSettings?.defaultAgentSettings?.[defaultAgent]?.defaultModel?.providerId &&
      defaultSettings?.defaultAgentSettings?.[defaultAgent]?.defaultModel?.label
    ) {
      const allModels = $catalogModels;
      const match = allModels.find(
        m =>
          m.providerId === defaultSettings?.defaultAgentSettings?.[defaultAgent]?.defaultModel?.providerId &&
          m.label === defaultSettings?.defaultAgentSettings?.[defaultAgent]?.defaultModel?.label,
      );
      if (match) {
        wizard.draft.selectedModel = match;
      }
    }
    if (!wizard.draft.selectedModel) {
      const firstModel = getFirstCompatibleModel();
      if (firstModel) {
        wizard.draft.selectedModel = firstModel;
      }
    }

    wizard.draft.customImage = '';
    wizard.draft.initialized = true;
  }
});
let customHosts = $derived(wizard.draft.hostsByMode[wizard.draft.selectedNetwork] ?? []);
let reachableGateways = $derived($openshellGateways.filter(isUsableGateway));

$effect.pre(() => {
  const gateways = reachableGateways;
  if (gateways.length === 0) {
    wizard.draft.selectedGateway = '';
    return;
  }

  const selected = untrack(() => wizard.draft.selectedGateway);
  if (selected && gateways.some(gateway => gateway.name === selected)) {
    return;
  }

  const activeGateway = gateways.find(gateway => gateway.active);
  wizard.draft.selectedGateway = activeGateway?.name ?? (gateways.length === 1 ? (gateways[0]?.name ?? '') : '');
});

function getDefaultSessionName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, '');
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}

function getEffectiveWorkspaceName(): string {
  const trimmed = wizard.draft.sessionName.trim();
  if (wizard.draft.nameManuallyEdited) return trimmed;
  return trimmed || getDefaultSessionName(wizard.draft.sourcePath);
}

function getEffectiveWorkspaceNameFromSnapshot(draft: { sessionName: string; sourcePath: string }): string {
  return draft.sessionName.trim() || getDefaultSessionName(draft.sourcePath);
}

function isWorkspaceNameValid(): boolean {
  return getSandboxNameValidationError(getEffectiveWorkspaceName()) === undefined;
}

let previousSourcePath = '';
$effect(() => {
  const currentPath = wizard.draft.sourcePath;
  const pathChanged = currentPath !== previousSourcePath;
  previousSourcePath = currentPath;
  if (wizard.draft.nameManuallyEdited && !(pathChanged && !wizard.draft.sessionName.trim())) return;
  const last = getDefaultSessionName(currentPath);
  if (!last) return;
  wizard.draft.nameManuallyEdited = false;
  wizard.draft.sessionName = sanitizeDns1123Label(last);
});

let configCheckToken = 0;

$effect(() => {
  const trimmed = wizard.draft.sourcePath.trim();
  const token = ++configCheckToken;
  if (trimmed) {
    window
      .checkAgentWorkspaceConfigExists(trimmed)
      .then(exists => {
        if (token === configCheckToken) {
          wizard.draft.configExists = exists;
        }
      })
      .catch(() => {
        if (token === configCheckToken) {
          wizard.draft.configExists = false;
        }
      });
  } else {
    const name = getEffectiveWorkspaceName();
    const gateway = wizard.draft.selectedGateway;
    if (name && gateway && !getSandboxNameValidationError(name)) {
      window
        .checkAgentWorkspaceGlobalConfigExists(gateway, name)
        .then(exists => {
          if (token === configCheckToken) {
            wizard.draft.configExists = exists;
          }
        })
        .catch(() => {
          if (token === configCheckToken) {
            wizard.draft.configExists = false;
          }
        });
    } else {
      wizard.draft.configExists = false;
    }
  }
});

// --- Wizard navigation ---
let currentStepIndex = $derived(wizard.draft.currentStepIndex);
let error = $state('');
let secretsLoading = $state(false);

let currentStepId = $derived(wizardSteps[wizard.draft.currentStepIndex]?.id ?? '');
let hasModel = $derived(wizard.draft.selectedModel !== undefined);
let validationErrors = $derived.by(() => {
  const errors: { name?: string } = {};
  const name = wizard.draft.sessionName.trim().toLowerCase();
  if (
    name &&
    $allOpenshellSandboxes.some(
      sandbox => sandbox.gatewayName === wizard.draft.selectedGateway && sandbox.name.toLowerCase() === name,
    )
  ) {
    errors.name = 'A workspace with this name already exists. Please choose a different name.';
  }
  return errors;
});
let nameError = $derived.by(() => {
  const name = getEffectiveWorkspaceName();
  if (!name && !wizard.draft.nameManuallyEdited) return undefined;
  return getSandboxNameValidationError(name) ?? validationErrors.name;
});

let createBlocker = $derived.by((): string | undefined => {
  if (!wizard.draft.selectedGateway) return 'Select a gateway in Folders';
  if (!getEffectiveWorkspaceName() || !isWorkspaceNameValid() || validationErrors.name)
    return 'Set a valid workspace name';
  if (!hasModel) return 'Pick a model';
  if (secretsLoading) return 'Loading vault secrets…';
  return undefined;
});

let readyMessage = $derived(
  createBlocker ??
    (currentStepIndex <= LAST_REQUIRED_STEP_INDEX
      ? `Ready to create now · steps ${LAST_REQUIRED_STEP_INDEX + 2} to ${wizardSteps.length} can stay on defaults`
      : 'Ready to create now'),
);

function goToStep(index: number): void {
  wizard.draft.currentStepIndex = index;
  wizard.draft.maxVisitedStepIndex = Math.max(wizard.draft.maxVisitedStepIndex, index);
}

function goNext(): void {
  if (wizard.draft.currentStepIndex < wizardSteps.length - 1) goToStep(wizard.draft.currentStepIndex + 1);
}

function goBack(): void {
  if (wizard.draft.currentStepIndex > 0) goToStep(wizard.draft.currentStepIndex - 1);
}

function goToStepId(stepId: string): void {
  const index = wizardSteps.findIndex(step => step.id === stepId);
  if (index >= 0) {
    wizard.draft.viewMode = 'visual';
    goToStep(index);
  }
}

function getStepState(index: number): 'done' | 'active' | 'pending' {
  if (index === currentStepIndex) return 'active';
  return index <= wizard.draft.maxVisitedStepIndex ? 'done' : 'pending';
}

// --- YAML view ---
let yamlContent = $state(wizard.draft.viewMode === 'yaml' ? draftToYaml() : '');
let yamlError = $state<string | undefined>(undefined);

function setViewMode(mode: 'visual' | 'yaml'): void {
  if (mode === 'yaml') {
    yamlContent = draftToYaml();
    yamlError = undefined;
  }
  wizard.draft.viewMode = mode;
}

function handleYamlChange(event: CustomEvent<string>): void {
  yamlError = applyYamlToDraft(event.detail, $catalogModels);
}

function handleKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !createBlocker) {
    event.preventDefault();
    startWorkspace();
  }
}

function markNameEdited(): void {
  wizard.draft.nameManuallyEdited = true;
}

// --- Summaries shown on collapsed steps and in the blueprint ---
let selectedAgentInfo = $derived($agentInfos.find(a => a.id === wizard.draft.selectedAgent));
let effectiveImage = $derived(
  wizard.draft.customImage.trim() !== ''
    ? wizard.draft.customImage.trim()
    : (selectedAgentInfo?.baseImage ?? 'Agent default image'),
);
let addonCount = $derived(
  wizard.draft.selectedSkillIds.length +
    wizard.draft.selectedKnowledgeIds.length +
    wizard.draft.selectedSecretIds.length,
);
let mountedFolders = $derived(
  wizard.draft.selectedFileAccess === 'custom' ? wizard.draft.customMounts.filter(m => m.host.trim() !== '') : [],
);
let folderCount = $derived(mountedFolders.length + (wizard.draft.sourcePath.trim() ? 1 : 0));
let writableCount = $derived(mountedFolders.filter(m => !m.ro).length + (wizard.draft.sourcePath.trim() ? 1 : 0));
let allowedHosts = $derived(customHosts.filter(h => h.trim() !== ''));

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

function addCustomHost(): void {
  const current = wizard.draft.hostsByMode[wizard.draft.selectedNetwork] ?? [];
  wizard.draft.hostsByMode = { ...wizard.draft.hostsByMode, [wizard.draft.selectedNetwork]: [...current, ''] };
}

function removeCustomHost(index: number): void {
  const current = wizard.draft.hostsByMode[wizard.draft.selectedNetwork] ?? [];
  if (current.length <= 1) return;
  wizard.draft.hostsByMode = {
    ...wizard.draft.hostsByMode,
    [wizard.draft.selectedNetwork]: current.filter((_, i) => i !== index),
  };
}

function updateCustomHost(index: number, value: string): void {
  const current = wizard.draft.hostsByMode[wizard.draft.selectedNetwork] ?? [];
  wizard.draft.hostsByMode = {
    ...wizard.draft.hostsByMode,
    [wizard.draft.selectedNetwork]: current.map((h, i) => (i === index ? value : h)),
  };
}

async function handleBrowseCustomPath(index: number): Promise<void> {
  try {
    const result = await window.openDialog({ title: 'Select a directory', selectors: ['openDirectory'] });
    const selected = result?.[0];
    if (selected) updateCustomMount(index, 'host', selected);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error = message;
    toast.error(`Failed to browse for directory: ${message}`);
  }
}

async function handleBrowseSource(): Promise<void> {
  try {
    const result = await window.openDialog({ title: 'Select a working directory', selectors: ['openDirectory'] });
    const selected = result?.[0];
    if (selected) {
      wizard.draft.sourcePath = selected;
      if (!wizard.draft.nameManuallyEdited) {
        const lastSegment = getDefaultSessionName(selected);
        if (lastSegment) wizard.draft.sessionName = sanitizeDns1123Label(lastSegment);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error = message;
    toast.error(`Failed to browse for directory: ${message}`);
  }
}

function cancel(): void {
  resetDraft();
  handleNavigation({ page: NavigationPage.AGENT_WORKSPACES });
}

function normalizeTildeToHome(p: string): string {
  return p.startsWith('~/') ? `$HOME/${p.slice(2)}` : p;
}

function getAgentWorkspaceConfiguration(agent: string): AgentWorkspaceConfiguration | undefined {
  const config = defaultSettings?.defaultAgentSettings?.[agent]?.workspaceConfiguration;
  if (!config) return undefined;
  const snapshot = $state.snapshot(config);
  if (snapshot.mounts) {
    snapshot.mounts = snapshot.mounts.map(m => ({
      ...m,
      host: normalizeTildeToHome(m.host),
      target: normalizeTildeToHome(m.target),
    }));
  }
  return snapshot;
}

function getFirstCompatibleModel(): ModelInfo | undefined {
  const agentInfo = $agentInfos.find(a => a.id === wizard.draft.selectedAgent);
  const enabled = $catalogModels.filter(m => isModelEnabled($disabledModels, m.providerId, m.label));
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const seen = new Set<string>();
  const unique = enabled.filter(m => {
    const key = modelKey(m.providerId, m.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!agentInfo?.supportedModelTypes || agentInfo.supportedModelTypes.length === 0) return unique[0];
  const typeNames = new Set(agentInfo.supportedModelTypes.map(t => t.name));
  return unique.filter(m => m.llmMetadata?.name !== undefined && typeNames.has(m.llmMetadata.name))[0];
}

function buildMountsFrom(fileAccess: string, mounts: CustomMount[]): AgentWorkspaceMount[] | undefined {
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

function startAsIs(): void {
  if (
    !wizard.draft.selectedGateway ||
    !wizard.draft.selectedModel ||
    !isWorkspaceNameValid() ||
    validationErrors.name
  ) {
    return;
  }

  const draftSnapshot = $state.snapshot(wizard.draft);

  window
    .createAgentWorkspace({
      sourcePath: draftSnapshot.sourcePath.trim() || undefined,
      agent: draftSnapshot.selectedAgent,
      image: draftSnapshot.customImage.trim() || undefined,
      model: getModelId(draftSnapshot.selectedModel!),
      gateway: draftSnapshot.selectedGateway,
      name: getEffectiveWorkspaceNameFromSnapshot(draftSnapshot),
      description: draftSnapshot.description || undefined,
      project: draftSnapshot.selectedProjectId,
    })
    .then(() => resetDraft())
    .catch((err: unknown) => {
      console.error('Failed to create agent workspace (as-is)', err);
      window
        .showMessageBox({
          title: 'Agent Workspace',
          type: 'error',
          message: `Error while creating workspace: ${err instanceof Error ? err.message : String(err)}`,
          buttons: ['OK'],
        })
        .catch(console.error);
    });
  handleNavigation({ page: NavigationPage.AGENT_WORKSPACES });
}

function startWorkspace(): void {
  if (
    !wizard.draft.selectedGateway ||
    !getEffectiveWorkspaceName() ||
    !wizard.draft.selectedModel ||
    !isWorkspaceNameValid() ||
    validationErrors.name
  ) {
    return;
  }

  const draftSnapshot = $state.snapshot(wizard.draft);

  const selectedSkillPaths = $skillInfos.filter(s => draftSnapshot.selectedSkillIds.includes(s.name)).map(s => s.path);
  const network = mapNetworkSelection(
    draftSnapshot.selectedNetwork,
    draftSnapshot.hostsByMode[draftSnapshot.selectedNetwork] ?? [],
  );
  const mounts = buildMountsFrom(draftSnapshot.selectedFileAccess, draftSnapshot.customMounts);

  const selected = $mcpRemoteServerInfos.filter(m => draftSnapshot.selectedMcpIds.includes(m.id));
  const remoteServers = selected
    .filter(m => m.setupType === 'remote' || (!m.setupType && m.url))
    .map(m => ({ name: m.name, url: m.url }));
  const commandServers = selected
    .filter(m => m.setupType === 'package' && m.commandSpec)
    .map(m => ({
      name: m.name,
      command: m.commandSpec!.command,
      args: m.commandSpec!.args,
      env: m.commandSpec!.env,
    }));
  const hasMcp = remoteServers.length > 0 || commandServers.length > 0;

  window
    .createAgentWorkspace({
      sourcePath: draftSnapshot.sourcePath.trim() || undefined,
      agent: draftSnapshot.selectedAgent,
      image: draftSnapshot.customImage.trim() || undefined,
      model: getModelId(draftSnapshot.selectedModel!),
      gateway: draftSnapshot.selectedGateway,
      name: getEffectiveWorkspaceNameFromSnapshot(draftSnapshot),
      description: draftSnapshot.description || undefined,
      skills: selectedSkillPaths.length > 0 ? selectedSkillPaths : undefined,
      network,
      secrets: draftSnapshot.selectedSecretIds.length > 0 ? [...draftSnapshot.selectedSecretIds] : undefined,
      mounts,
      mcp: hasMcp
        ? {
            ...(remoteServers.length > 0 ? { servers: remoteServers } : {}),
            ...(commandServers.length > 0 ? { commands: commandServers } : {}),
          }
        : undefined,
      workspaceConfiguration: getAgentWorkspaceConfiguration(draftSnapshot.selectedAgent),
      replaceConfig: draftSnapshot.configExists && draftSnapshot.configAction === 'replace' ? true : undefined,
      project: draftSnapshot.selectedProjectId,
    })
    .then(() => resetDraft())
    .catch((err: unknown) => {
      console.error('Failed to create agent workspace', err);
      window
        .showMessageBox({
          title: 'Agent Workspace',
          type: 'error',
          message: `Error while creating workspace: ${err instanceof Error ? err.message : String(err)}`,
          buttons: ['OK'],
        })
        .catch(console.error);
    });
  handleNavigation({ page: NavigationPage.AGENT_WORKSPACES });
}
</script>


<svelte:window onkeydown={handleKeydown} />

<FormPage title="Create Agent Workspace">
  {#snippet content()}
    <div class="px-5 pb-5 min-w-full">
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 bg-[var(--pd-content-card-bg)] p-6">

        <div class="flex flex-col gap-4 min-w-0">
          <!-- Header: editable name, progress, view toggle -->
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-3">
                <span class="text-3xl font-bold text-[var(--pd-modal-text)]">Configure</span>
                <input
                  aria-label="Workspace name"
                  class="min-w-0 w-80 bg-transparent text-3xl font-bold text-[var(--pd-label-primary-text)] border-b border-dashed border-[var(--pd-label-primary-text)] outline-none"
                  placeholder="workspace-name"
                  bind:value={wizard.draft.sessionName}
                  oninput={markNameEdited}
                  aria-invalid={nameError !== undefined} />
                <Icon icon={faPen} size="sm" class="text-[var(--pd-content-card-text)] opacity-70" />
              </div>
              {#if nameError}
                <p class="text-sm text-[var(--pd-input-field-error-text)] mt-1">{nameError}</p>
              {/if}
              <p class="flex items-center gap-2 text-sm text-[var(--pd-content-card-text)] opacity-70 mt-2">
                <Icon icon={faServer} size="xs" />
                {wizard.draft.selectedGateway ? `OpenShell gateway · ${wizard.draft.selectedGateway}` : 'No gateway selected'}
              </p>
            </div>

            <div class="flex items-center gap-4">
              <div class="flex gap-1" aria-label="Progress">
                {#each wizardSteps as step, index (step.id)}
                  <span class="w-7 h-1 rounded-full
                    {index === currentStepIndex
                      ? 'bg-[var(--pd-label-primary-text)]'
                      : getStepState(index) === 'done'
                        ? 'bg-[var(--pd-label-tertiary-text)]'
                        : 'bg-[var(--pd-content-card-border)]'}"></span>
                {/each}
              </div>
              <span class="text-sm text-[var(--pd-content-card-text)]">{currentStepIndex + 1} of {wizardSteps.length}</span>
              <div class="flex rounded-lg border border-[var(--pd-content-card-border)] p-0.5" role="group" aria-label="View mode">
                {#each [{ id: 'visual', label: 'Visual' }, { id: 'yaml', label: 'YAML' }] as const as mode (mode.id)}
                  <button
                    type="button"
                    aria-pressed={wizard.draft.viewMode === mode.id}
                    class="px-3 py-1 rounded-md text-sm cursor-pointer
                      {wizard.draft.viewMode === mode.id
                        ? 'bg-[var(--pd-content-card-hover-inset-bg)] text-[var(--pd-modal-text)]'
                        : 'text-[var(--pd-content-card-text)]'}"
                    onclick={(): void => setViewMode(mode.id)}>{mode.label}</button>
                {/each}
              </div>
            </div>
          </div>

          {#if wizard.draft.viewMode === 'yaml'}
            <div class="h-[70vh] rounded-xl border border-[var(--pd-content-card-border)] overflow-hidden">
              <MonacoEditor content={yamlContent} language="yaml" readOnly={false} on:contentChange={handleYamlChange} />
            </div>
            {#if yamlError}
              <div class="text-sm text-[var(--pd-input-field-error-text)]" role="alert">{yamlError}</div>
            {/if}
          {:else}
            <AgentWorkspaceCreateStepCard
              index={1}
              title="Base image"
              state={getStepState(0)}
              onOpen={(): void => goToStep(0)}
              onContinue={goNext}>
              {#snippet summary()}<span class="font-mono">{effectiveImage}</span>{/snippet}
              <AgentWorkspaceCreateStepAgentModel section="image" bind:selectedAgent={wizard.draft.selectedAgent} bind:selectedModel={wizard.draft.selectedModel} bind:customImage={wizard.draft.customImage} />
            </AgentWorkspaceCreateStepCard>

            <AgentWorkspaceCreateStepCard
              index={2}
              title="Agent"
              state={getStepState(1)}
              onOpen={(): void => goToStep(1)}
              onContinue={goNext}
              onBack={goBack}>
              {#snippet summary()}
                <span class="inline-flex items-center gap-2 text-[var(--pd-modal-text)]">
                  <IconImage image={selectedAgentInfo?.icon?.logo ?? selectedAgentInfo?.icon?.icon} alt={selectedAgentInfo?.name ?? ''} class="w-5 h-5">
                    <Icon icon={faTerminal} size="sm" />
                  </IconImage>
                  {selectedAgentInfo?.name ?? wizard.draft.selectedAgent}
                </span>
              {/snippet}
              <AgentWorkspaceCreateStepAgentModel section="agent" bind:selectedAgent={wizard.draft.selectedAgent} bind:selectedModel={wizard.draft.selectedModel} bind:customImage={wizard.draft.customImage} />
            </AgentWorkspaceCreateStepCard>

            <AgentWorkspaceCreateStepCard
              index={3}
              title="Model"
              chip={selectedAgentInfo ? `for ${selectedAgentInfo.name}` : undefined}
              hint="The list follows the agent you picked"
              state={getStepState(2)}
              continueDisabled={!hasModel}
              onOpen={(): void => goToStep(2)}
              onContinue={goNext}
              onBack={goBack}>
              {#snippet summary()}<span class="text-[var(--pd-modal-text)]">{wizard.draft.selectedModel?.label ?? 'No model selected'}</span>{/snippet}
              <AgentWorkspaceCreateStepAgentModel section="model" bind:selectedAgent={wizard.draft.selectedAgent} bind:selectedModel={wizard.draft.selectedModel} bind:customImage={wizard.draft.customImage} />
              <p class="text-sm text-[var(--pd-content-card-text)] opacity-70 mt-3">
                Model credentials are injected by the gateway and never stored in the sandbox.
              </p>
            </AgentWorkspaceCreateStepCard>

            <AgentWorkspaceCreateStepCard
              index={4}
              title="Add-ons"
              badge="Optional"
              state={getStepState(3)}
              continueDisabled={secretsLoading}
              onOpen={(): void => goToStep(3)}
              onContinue={goNext}
              onBack={goBack}>
              {#snippet summary()}
                {addonCount
                  ? `${wizard.draft.selectedSkillIds.length} skills · ${wizard.draft.selectedKnowledgeIds.length} knowledges · ${wizard.draft.selectedSecretIds.length} secrets`
                  : 'None yet · skills, knowledges and vault secrets'}
              {/snippet}
              <AgentWorkspaceCreateStepToolsSecrets
                includeMcp={false}
                {skillItems}
                gateway={wizard.draft.selectedGateway}
                bind:selectedSkillIds={wizard.draft.selectedSkillIds}
                {mcpItems}
                bind:selectedMcpIds={wizard.draft.selectedMcpIds}
                bind:selectedSecretIds={wizard.draft.selectedSecretIds}
                bind:secretsLoading
                {knowledgeItems}
                bind:selectedKnowledgeIds={wizard.draft.selectedKnowledgeIds} />
            </AgentWorkspaceCreateStepCard>

            <AgentWorkspaceCreateStepCard
              index={5}
              title="MCP servers"
              badge="Optional"
              state={getStepState(4)}
              onOpen={(): void => goToStep(4)}
              onContinue={goNext}
              onBack={goBack}>
              {#snippet summary()}
                {wizard.draft.selectedMcpIds.length
                  ? `${wizard.draft.selectedMcpIds.length} server${wizard.draft.selectedMcpIds.length === 1 ? '' : 's'}`
                  : 'None yet · add from the registry'}
              {/snippet}
              <ChecklistPanel
                title="MCP Servers"
                subtitle="Connect to Model Context Protocol servers for extended capabilities"
                icon={faServer}
                items={mcpItems}
                bind:selected={wizard.draft.selectedMcpIds}
                emptyMessage="No MCP servers available yet." />
            </AgentWorkspaceCreateStepCard>

            <AgentWorkspaceCreateStepCard
              index={6}
              title="Folders"
              badge="Default"
              state={getStepState(5)}
              onOpen={(): void => goToStep(5)}
              onContinue={goNext}
              onBack={goBack}>
              {#snippet summary()}
                <span class="font-mono">{wizard.draft.sourcePath.trim() || 'No project folder · sandbox only'}</span>
                {#if mountedFolders.length}<span> · +{mountedFolders.length} mount{mountedFolders.length === 1 ? '' : 's'}</span>{/if}
              {/snippet}
              <div class="flex flex-col gap-6">
                <AgentWorkspaceCreateStepWorkspace
                  embedded
                  bind:sourcePath={wizard.draft.sourcePath}
                  bind:sessionName={wizard.draft.sessionName}
                  gateways={[...reachableGateways]}
                  bind:selectedGateway={wizard.draft.selectedGateway}
                  bind:description={wizard.draft.description}
                  bind:nameManuallyEdited={wizard.draft.nameManuallyEdited}
                  bind:descriptionOpen={wizard.draft.descriptionOpen}
                  bind:projectOpen={wizard.draft.projectOpen}
                  onBrowseSource={handleBrowseSource}
                  configExists={wizard.draft.configExists}
                  bind:configAction={wizard.draft.configAction}
                  onStartAsIs={startAsIs}
                  startAsIsDisabled={!hasModel || wizard.draft.selectedGateway === ''}
                  projects={[...$workspaceProjectInfos]}
                  selectedProjectId={wizard.draft.selectedProjectId}
                  onProjectSelect={handleProjectSelect}
                  errors={validationErrors} />
                <AgentWorkspaceCreateStepFileSystem
                  bind:selectedFileAccess={wizard.draft.selectedFileAccess}
                  customMounts={wizard.draft.customMounts}
                  onBrowseCustomPath={handleBrowseCustomPath}
                  onAddCustomMount={addCustomMount}
                  onRemoveCustomMount={removeCustomMount}
                  onUpdateCustomMount={updateCustomMount} />
              </div>
            </AgentWorkspaceCreateStepCard>

            <AgentWorkspaceCreateStepCard
              index={7}
              title="Reachable hostnames"
              badge="Default"
              state={getStepState(6)}
              onOpen={(): void => goToStep(6)}
              onBack={goBack}>
              {#snippet summary()}
                {#if allowedHosts.length}
                  <span class="font-mono">{allowedHosts[0]}</span>{#if allowedHosts.length > 1}<span> · +{allowedHosts.length - 1} more</span>{/if}
                {:else}
                  Deny all outbound traffic
                {/if}
              {/snippet}
              <AgentWorkspaceCreateStepNetworking
                bind:selectedNetwork={wizard.draft.selectedNetwork}
                customHosts={customHosts}
                onAddCustomHost={addCustomHost}
                onRemoveCustomHost={removeCustomHost}
                onUpdateCustomHost={updateCustomHost} />
            </AgentWorkspaceCreateStepCard>
          {/if}

          {#if error}
            <div class="text-sm text-[var(--pd-input-field-error-text)]">{error}</div>
          {/if}
        </div>

        <AgentWorkspaceBlueprint
          name={getEffectiveWorkspaceName()}
          image={effectiveImage}
          agent={selectedAgentInfo?.name ?? wizard.draft.selectedAgent}
          model={wizard.draft.selectedModel?.label ?? 'none'}
          {addonCount}
          mcpCount={wizard.draft.selectedMcpIds.length}
          {folderCount}
          {writableCount}
          hostCount={allowedHosts.length}
          activeStepId={wizard.draft.viewMode === 'visual' ? currentStepId : ''}
          canCreate={createBlocker === undefined}
          {readyMessage}
          onSelectStep={goToStepId}
          onCreate={startWorkspace}
          onCancel={cancel} />
      </div>
    </div>
  {/snippet}
</FormPage>
