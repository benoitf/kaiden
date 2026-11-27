<script lang="ts">
import { faCheck, faPen } from '@fortawesome/free-solid-svg-icons';
import { Button, Dropdown } from '@podman-desktop/ui-svelte';
import { Icon } from '@podman-desktop/ui-svelte/icons';
import { onMount, untrack } from 'svelte';

import { addons } from '/@/kaiden/stores/addons';
import {
  applyProjectToDraft,
  resetDraft,
  wizard,
  WORKSPACE_REGISTRY_HOSTS,
  type WorkspaceCreateView,
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
import MonacoEditor from '/@/lib/editor/MonacoEditor.svelte';
import type { ChecklistItem } from '/@/lib/ui/ChecklistPanel.svelte';
import FormPage from '/@/lib/ui/FormPage.svelte';
import { handleNavigation } from '/@/navigation';
import { sanitizeDns1123Label } from '/@api/agent-workspace-info';
import type { ModelInfo } from '/@api/model-registry-info';
import { NavigationPage } from '/@api/navigation-page';
import type { DefaultWorkspaceSettings } from '/@api/onboarding-settings-info';
import { isUsableGateway } from '/@api/openshell-gateway-info';
import type { SecretInfo } from '/@api/secret-info';
import type { WorkspaceProjectInfo } from '/@api/workspace-project-info';

import {
  buildCreateOptions,
  formatFoldersSummary,
  formatNames,
  getDefaultSessionName,
  getEffectiveWorkspaceName,
  getReachableHosts,
  getWorkspaceNameError,
  summarizeFolders,
  toYaml,
} from './agent-workspace-create-options';
import AgentWorkspaceBlueprint, { type BlueprintCardInfo } from './AgentWorkspaceBlueprint.svelte';
import AgentWorkspaceCreateEditor from './AgentWorkspaceCreateEditor.svelte';
import WorkspaceDescriptionField from './WorkspaceDescriptionField.svelte';

const views: { id: WorkspaceCreateView; label: string }[] = [
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'list', label: 'List' },
  { id: 'yaml', label: 'YAML' },
];

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

// addons providing an agent come with the agent: only the others can be added
let agentAddonImages = $derived(new Set($agentInfos.flatMap(a => a.addonImages ?? [])));
let addonItems: ChecklistItem[] = $derived(
  $addons
    .filter(a => !agentAddonImages.has(a.ociImage))
    .map(a => ({
      id: a.id,
      name: a.version ? `${a.displayName} ${a.version}` : a.displayName,
      description: a.description,
      group: a.category,
    })),
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

    const defaultModel = defaultAgent ? defaultSettings?.defaultAgentSettings?.[defaultAgent]?.defaultModel : undefined;
    if (defaultModel?.providerId && defaultModel.label) {
      const match = $catalogModels.find(
        m => m.providerId === defaultModel.providerId && m.label === defaultModel.label,
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

let effectiveName = $derived(getEffectiveWorkspaceName(wizard.draft));
let nameError = $derived(getWorkspaceNameError(wizard.draft, $allOpenshellSandboxes));

let configCheckToken = 0;

$effect(() => {
  const trimmed = wizard.draft.sourcePath.trim();
  const token = ++configCheckToken;
  const name = effectiveName;
  const gateway = wizard.draft.selectedGateway;
  let check: Promise<boolean> | undefined;
  if (trimmed) {
    check = window.checkAgentWorkspaceConfigExists(trimmed);
  } else if (name && gateway && !nameError) {
    check = window.checkAgentWorkspaceGlobalConfigExists(gateway, name);
  }
  if (!check) {
    wizard.draft.configExists = false;
    return;
  }
  check
    .then(exists => {
      if (token === configCheckToken) wizard.draft.configExists = exists;
    })
    .catch((err: unknown) => {
      console.error(`Failed to check workspace configuration of '${trimmed || name}'`, err);
      if (token === configCheckToken) wizard.draft.configExists = false;
    });
});

// --- Secrets of the selected gateway ---
let secrets = $state.raw<SecretInfo[]>([]);
let secretsLoading = $state(false);
let secretItems: ChecklistItem[] = $derived(
  secrets.map(s => ({
    id: s.name,
    name: s.name,
    description: [s.type, s.description].filter(Boolean).join(' · '),
  })),
);

$effect(() => {
  const gateway = wizard.draft.selectedGateway;
  let cancelled = false;
  const requestedSecretIds = untrack(() => wizard.draft.selectedSecretIds);
  secrets = [];
  secretsLoading = true;
  window.listSecrets(gateway).then(
    items => {
      if (cancelled) return;
      secrets = items;
      const available = new Set(items.map(item => item.name));
      wizard.draft.selectedSecretIds = requestedSecretIds.filter(id => available.has(id));
      secretsLoading = false;
    },
    (err: unknown) => {
      if (cancelled) return;
      wizard.draft.selectedSecretIds = [];
      secretsLoading = false;
      console.error(`Failed to list secrets of gateway '${gateway}'`, err);
    },
  );
  return (): void => {
    cancelled = true;
  };
});

// --- Options and card summaries ---
let createOptions = $derived(
  buildCreateOptions($state.snapshot(wizard.draft), {
    skills: $skillInfos,
    mcpServers: $mcpRemoteServerInfos,
    workspaceConfiguration: $state.snapshot(
      defaultSettings?.defaultAgentSettings?.[wizard.draft.selectedAgent]?.workspaceConfiguration,
    ),
  }),
);
let canCreate = $derived(
  createOptions !== undefined &&
    wizard.draft.selectedGateway !== '' &&
    effectiveName !== '' &&
    !nameError &&
    !secretsLoading,
);

let selectedAgentInfo = $derived($agentInfos.find(a => a.id === wizard.draft.selectedAgent));
let folders = $derived(summarizeFolders(wizard.draft));
let reachableHosts = $derived(getReachableHosts(wizard.draft));

let insideCards: BlueprintCardInfo[] = $derived([
  {
    id: 'model',
    label: 'Model',
    value: wizard.draft.selectedModel?.label ?? 'No model',
    color: 'model',
    layer: 'model',
  },
  {
    id: 'agent',
    label: 'Agent',
    value: selectedAgentInfo?.name ?? wizard.draft.selectedAgent,
    color: 'agent',
    layer: 'agent',
  },
  {
    id: 'addons',
    label: 'Add-ons',
    value: 'None',
    chips: addonItems.filter(a => wizard.draft.selectedAddonIds.includes(a.id)).map(a => a.name),
    color: 'addons',
    layer: 'add-ons',
  },
  {
    id: 'image',
    label: 'Base image',
    value: wizard.draft.customImage.trim()
      ? wizard.draft.customImage.trim()
      : (selectedAgentInfo?.baseImage ?? 'Agent default'),
    color: 'image',
    layer: 'image',
  },
]);

let boundaryCards: BlueprintCardInfo[] = $derived([
  {
    id: 'mcp',
    label: 'MCP servers',
    value: formatNames(
      $mcpRemoteServerInfos.filter(m => wizard.draft.selectedMcpIds.includes(m.id)).map(m => m.name),
      'None',
    ),
    color: 'image',
  },
  { id: 'folders', label: 'Folders', value: formatFoldersSummary(folders), color: 'addons' },
  {
    id: 'hosts',
    label: 'Reachable hostnames',
    value: `${reachableHosts.length} host${reachableHosts.length === 1 ? '' : 's'}`,
    color: 'custom',
  },
  {
    id: 'credentials',
    label: 'Credentials',
    value: formatNames(wizard.draft.selectedSecretIds, 'None'),
    color: 'agent',
  },
]);

let openCardId: string | undefined = $state();
let nameInputOpen = $state(false);

function markNameEdited(): void {
  wizard.draft.nameManuallyEdited = true;
}

function toggleNameInput(): void {
  nameInputOpen = !nameInputOpen;
}

function closeNameInput(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === 'Escape') nameInputOpen = false;
}

function toggleDescription(): void {
  wizard.draft.descriptionOpen = !wizard.draft.descriptionOpen;
}

function selectView(view: WorkspaceCreateView): void {
  wizard.draft.view = view;
  openCardId = undefined;
}

function cancel(): void {
  resetDraft();
  handleNavigation({ page: NavigationPage.AGENT_WORKSPACES });
}

function getFirstCompatibleModel(): ModelInfo | undefined {
  const agentInfo = $agentInfos.find(a => a.id === wizard.draft.selectedAgent);
  const enabled = $catalogModels.filter(m => isModelEnabled($disabledModels, m.providerId, m.label));
  const unique = enabled.filter(
    (m, i) => enabled.findIndex(o => modelKey(o.providerId, o.label) === modelKey(m.providerId, m.label)) === i,
  );
  if (!agentInfo?.supportedModelTypes || agentInfo.supportedModelTypes.length === 0) return unique[0];
  const typeNames = new Set(agentInfo.supportedModelTypes.map(t => t.name));
  return unique.find(m => m.llmMetadata?.name !== undefined && typeNames.has(m.llmMetadata.name));
}

function create(): void {
  if (!canCreate || !createOptions) return;
  window
    .createAgentWorkspace(createOptions)
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

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    create();
  }
}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet editor(id: string)}
  <AgentWorkspaceCreateEditor {id} {secretItems} {addonItems} {reachableHosts} onProjectSelect={handleProjectSelect} />
{/snippet}

<FormPage title="New workspace">
  {#snippet content()}
    <div class="flex flex-col w-full min-h-full px-8 pt-4 pb-6 gap-6 bg-[var(--pd-content-bg)]">
      <!-- Header -->
      <div class="flex items-start justify-between gap-6">
        <div class="flex flex-col gap-1 min-w-0">
          <h1 class="flex items-baseline gap-3 text-3xl font-semibold text-[var(--pd-content-header)]">
            Configure
            {#if nameInputOpen}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                autofocus
                class="bg-transparent outline-none border-b border-dashed border-[var(--pd-blueprint-model)] text-[var(--pd-blueprint-model)] min-w-0"
                aria-label="Workspace name"
                placeholder="workspace-name"
                bind:value={wizard.draft.sessionName}
                oninput={markNameEdited}
                onkeydown={closeNameInput}
                onblur={toggleNameInput} />
            {:else}
              <button
                type="button"
                class="flex items-baseline gap-2 cursor-pointer border-b border-dashed border-[var(--pd-blueprint-model)] text-[var(--pd-blueprint-model)]"
                aria-label="Edit workspace name"
                onclick={toggleNameInput}>
                {effectiveName || 'unnamed'}
                <Icon icon={faPen} size="xs" class="text-[var(--pd-content-card-text)]" />
              </button>
            {/if}
          </h1>
          {#if nameError}
            <p class="text-sm text-[var(--pd-input-field-error-text)]" role="alert">{nameError}</p>
          {/if}
          <button
            type="button"
            class="self-start text-sm text-[var(--pd-link)] cursor-pointer"
            aria-expanded={wizard.draft.descriptionOpen}
            onclick={toggleDescription}>
            {wizard.draft.descriptionOpen ? 'Hide description' : 'Add a description'}
          </button>
          {#if wizard.draft.descriptionOpen}
            <div class="w-[36rem]">
              <WorkspaceDescriptionField
                bind:value={wizard.draft.description}
                placeholder="e.g. Debug the login timeout — reproduce issue #42 and propose a fix (optional, max 500 chars)" />
            </div>
          {/if}
        </div>

        <div class="flex items-center gap-4 shrink-0">
          {#if reachableGateways.length > 1}
            <label for="workspace-gateway" class="sr-only">Gateway</label>
            <Dropdown id="workspace-gateway" name="workspace-gateway" bind:value={wizard.draft.selectedGateway}>
              {#each reachableGateways as gateway (gateway.name)}
                <option value={gateway.name}>{gateway.name} — {gateway.endpoint}</option>
              {/each}
            </Dropdown>
          {:else if wizard.draft.selectedGateway}
            <span class="flex items-center gap-2 text-sm text-[var(--pd-content-text)]">
              <span class="w-2 h-2 rounded-full bg-[var(--pd-status-running)]" aria-hidden="true"></span>
              OpenShell gateway · {wizard.draft.selectedGateway}
            </span>
          {:else}
            <span class="text-sm text-[var(--pd-input-field-error-text)]">No reachable OpenShell gateway</span>
          {/if}

          <div role="radiogroup" aria-label="View" class="flex rounded-lg border border-[var(--pd-content-card-border)] p-1">
            {#each views as view (view.id)}
              <button
                type="button"
                role="radio"
                aria-checked={wizard.draft.view === view.id}
                class="px-3 py-1 rounded-md text-sm cursor-pointer
                  {wizard.draft.view === view.id
                    ? 'bg-[var(--pd-content-card-inset-bg)] text-[var(--pd-content-card-title)]'
                    : 'text-[var(--pd-content-card-text)]'}"
                onclick={(): void => selectView(view.id)}>
                {view.label}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="grow">
        {#if wizard.draft.view === 'blueprint'}
          <AgentWorkspaceBlueprint name={effectiveName} inside={insideCards} boundary={boundaryCards} bind:openCardId {editor} />
        {:else if wizard.draft.view === 'list'}
          <div class="flex flex-col gap-4 max-w-4xl mx-auto">
            {#each [...insideCards, ...boundaryCards] as card (card.id)}
              <section
                aria-label={card.label}
                class="rounded-xl border border-[var(--pd-content-card-border)] bg-[var(--pd-content-card-bg)] p-5">
                <h2 class="text-base font-semibold text-[var(--pd-content-card-title)] mb-4">{card.label}</h2>
                <AgentWorkspaceCreateEditor
                  id={card.id}
                  {secretItems}
                  {addonItems}
                  {reachableHosts}
                  onProjectSelect={handleProjectSelect} />
              </section>
            {/each}
          </div>
        {:else}
          <div class="h-[560px] rounded-xl overflow-hidden border border-[var(--pd-content-card-border)]">
            <MonacoEditor content={toYaml(createOptions)} language="yaml" readOnly />
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between gap-4 rounded-xl border border-[var(--pd-content-card-border)] bg-[var(--pd-content-card-bg)] px-5 py-3">
        <ul class="flex flex-wrap items-center gap-6 text-sm text-[var(--pd-content-card-text)]" aria-label="Sandbox security">
          <li class="flex items-center gap-2">
            <Icon icon={faCheck} size="xs" class="text-[var(--pd-status-running)]" />
            <span><strong class="text-[var(--pd-content-card-title)]">Filesystem</strong> {folders.mounted} folder{folders.mounted === 1 ? '' : 's'}</span>
          </li>
          <li class="flex items-center gap-2">
            <Icon icon={faCheck} size="xs" class="text-[var(--pd-status-running)]" />
            <span><strong class="text-[var(--pd-content-card-title)]">Network</strong> deny by default</span>
          </li>
          <li class="flex items-center gap-2">
            <Icon icon={faCheck} size="xs" class="text-[var(--pd-status-running)]" />
            <span><strong class="text-[var(--pd-content-card-title)]">Credentials</strong> held by the gateway</span>
          </li>
        </ul>
        <div class="flex items-center gap-3">
          <Button type="secondary" onclick={cancel}>Cancel</Button>
          <Button disabled={!canCreate} inProgress={secretsLoading} onclick={create} title="Create workspace (Ctrl/⌘+Enter)">
            Create workspace
          </Button>
        </div>
      </div>
    </div>
  {/snippet}
</FormPage>
