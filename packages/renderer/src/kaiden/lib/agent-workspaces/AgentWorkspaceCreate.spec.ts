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

import '@testing-library/jest-dom/vitest';

import type { Addon } from '@openkaiden/api';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { writable } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import * as addonsStore from '/@/kaiden/stores/addons';
import { initializeDraftFromProject, resetDraft, wizard } from '/@/kaiden/stores/agent-workspace-create-draft.svelte';
import * as agentsStore from '/@/kaiden/stores/agents';
import * as mcpStore from '/@/kaiden/stores/mcp-remote-servers';
import * as modelCatalogStore from '/@/kaiden/stores/model-catalog';
import * as modelsStore from '/@/kaiden/stores/models';
import * as openshellGatewaysStore from '/@/kaiden/stores/openshell-gateways';
import * as openshellSandboxesStore from '/@/kaiden/stores/openshell-sandboxes';
import * as ragStore from '/@/kaiden/stores/rag-environments';
import * as secretVaultStore from '/@/kaiden/stores/secret-vault';
import * as skillsStore from '/@/kaiden/stores/skills';
import * as workspaceProjectsStore from '/@/kaiden/stores/workspace-projects';
import MonacoEditor from '/@/lib/editor/MonacoEditor.svelte';
import { handleNavigation } from '/@/navigation';
import * as providerStore from '/@/stores/providers';
import type { AgentInfo } from '/@api/agent-info';
import type { MCPRemoteServerInfo } from '/@api/mcp/mcp-server-info';
import type { CatalogModelInfo } from '/@api/model-registry-info';
import { NavigationPage } from '/@api/navigation-page';
import { type GatewayInfo, MIN_GATEWAY_VERSION, type SandboxInfo } from '/@api/openshell-gateway-info';
import type { ProviderInfo } from '/@api/provider-info';
import type { RagEnvironment } from '/@api/rag/rag-environment';
import type { GatewaySecretInfo } from '/@api/secret-info';
import type { SecretVaultInfo } from '/@api/secret-vault/secret-vault-info';
import type { SkillInfo } from '/@api/skill/skill-info';
import type { WorkspaceProjectInfo } from '/@api/workspace-project-info';

import AgentWorkspaceCreate from './AgentWorkspaceCreate.svelte';

vi.mock(import('/@/navigation'));
vi.mock(import('svelte-sonner'));
vi.mock(import('/@/lib/editor/MonacoEditor.svelte'));
vi.mock(import('/@/kaiden/stores/addons'));
vi.mock(import('/@/kaiden/stores/agents'));
vi.mock(import('/@/kaiden/stores/skills'));
vi.mock(import('/@/kaiden/stores/mcp-remote-servers'));
vi.mock(import('/@/kaiden/stores/secret-vault'));
vi.mock(import('/@/stores/providers'));
vi.mock(import('/@/kaiden/stores/rag-environments'));
vi.mock(import('/@/kaiden/stores/model-catalog'));
vi.mock(import('/@/kaiden/stores/models'));
vi.mock(import('/@/kaiden/stores/openshell-gateways'));
vi.mock(import('/@/kaiden/stores/openshell-sandboxes'));
vi.mock(import('/@/kaiden/stores/workspace-projects'));

function buildCatalogModels(providers: ProviderInfo[]): CatalogModelInfo[] {
  const result: CatalogModelInfo[] = [];
  for (const provider of providers) {
    for (const connection of provider.inferenceConnections ?? []) {
      for (const model of connection.models) {
        result.push({
          providerId: provider.id,
          providerName: provider.name,
          connectionId: connection.id,
          connectionName: connection.name,
          type: connection.type,
          llmMetadata: connection.llmMetadata,
          endpoint: connection.endpoint,
          label: model.label,
          connectionStatus: connection.status,
        } as CatalogModelInfo);
      }
    }
  }
  return result;
}

function setProviders(providers: ProviderInfo[]): void {
  vi.mocked(providerStore).providerInfos = writable<ProviderInfo[]>(providers);
  vi.mocked(modelsStore).catalogModels = writable<CatalogModelInfo[]>(buildCatalogModels(providers));
}

const mockAnthropicProvider: ProviderInfo = {
  id: 'claude',
  name: 'Anthropic',
  internalId: 'claude-internal',
  status: 'started',
  inferenceConnections: [
    {
      id: 'conn-0',
      name: 'Anthropic Cloud',
      type: 'cloud',
      status: 'started',
      llmMetadata: { name: 'anthropic' },
      models: [{ label: 'claude-sonnet-4' }, { label: 'claude-opus-4' }],
    },
  ],
  inferenceProviderConnectionCreation: false,
} as unknown as ProviderInfo;

const mockOllamaProvider: ProviderInfo = {
  id: 'ollama',
  name: 'Ollama',
  internalId: 'ollama-internal',
  status: 'started',
  inferenceConnections: [
    {
      id: 'conn-1',
      name: 'Ollama Local',
      type: 'local',
      status: 'started',
      llmMetadata: { name: 'ollama' },
      models: [{ label: 'llama3.2:3b' }],
    },
  ],
  inferenceProviderConnectionCreation: false,
} as unknown as ProviderInfo;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(window.listSecrets).mockResolvedValue([]);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  HTMLElement.prototype.animate = vi.fn().mockReturnValue({
    finished: Promise.resolve(),
    cancel: vi.fn(),
    onfinish: null,
  });
  vi.mocked(agentsStore).agentInfos = writable<AgentInfo[]>([
    {
      id: 'opencode',
      name: 'OpenCode',
      description: 'Open-source agent.',
      command: 'opencode',
      tags: ['Recommended'],
      destinationSkillsFolder: '/home/test/.opencode/skills',
      supportedModelTypes: [{ name: 'anthropic' }, { name: 'openai' }, { name: 'ollama' }, { name: 'gemini' }],
    },
    {
      id: 'claude',
      name: 'Claude Code',
      description: 'Anthropic Claude.',
      command: 'claude',
      tags: ['Cloud'],
      destinationSkillsFolder: '/home/test/.claude/skills',
      supportedModelTypes: [{ name: 'anthropic' }],
    },
    {
      id: 'goose',
      name: 'Goose',
      description: 'Autonomous coding agent.',
      command: 'goose',
      destinationSkillsFolder: '/home/test/.agents/skills',
      supportedModelTypes: [{ name: 'anthropic' }, { name: 'openai' }, { name: 'ollama' }, { name: 'gemini' }],
    },
  ]);
  vi.mocked(skillsStore).skillInfos = writable<SkillInfo[]>([]);
  vi.mocked(mcpStore).mcpRemoteServerInfos = writable<MCPRemoteServerInfo[]>([]);
  vi.mocked(secretVaultStore).secretVaultInfos = writable<readonly SecretVaultInfo[]>([]);
  setProviders([mockAnthropicProvider]);
  vi.mocked(ragStore).ragEnvironments = writable<RagEnvironment[]>([]);
  vi.mocked(modelCatalogStore).disabledModels = writable<Set<string>>(new Set());
  vi.mocked(modelCatalogStore.isModelEnabled).mockImplementation(
    (disabled: Set<string>, providerId: string, label: string): boolean => !disabled.has(`${providerId}::${label}`),
  );
  vi.mocked(modelCatalogStore.modelKey).mockImplementation(
    (providerId: string, label: string): string => `${providerId}::${label}`,
  );
  vi.mocked(modelCatalogStore.modelSelectionKey).mockImplementation(
    (providerId: string, connectionId: string, label: string): string => `${providerId}::${connectionId}::${label}`,
  );
  vi.mocked(addonsStore).addons = writable<Addon[]>([]);
  vi.mocked(workspaceProjectsStore).workspaceProjectInfos = writable<readonly WorkspaceProjectInfo[]>([]);
  vi.mocked(openshellGatewaysStore).openshellGateways = writable([
    {
      canStop: false,
      canStart: false,
      name: 'kaiden',
      endpoint: 'http://localhost:17670',
      active: true,
      gatewayState: { reachable: true, health: 'healthy', compatible: true },
    },
  ]);
  vi.mocked(openshellSandboxesStore).allOpenshellSandboxes = writable<(SandboxInfo & { gatewayName: string })[]>([]);
  vi.mocked(window.checkAgentWorkspaceConfigExists).mockResolvedValue(false);
  vi.mocked(window.checkAgentWorkspaceGlobalConfigExists).mockResolvedValue(false);
  vi.mocked(window.createAgentWorkspace).mockResolvedValue({ id: 'ws-1' });
  vi.mocked(window.showMessageBox).mockResolvedValue({ response: 0 });
  resetDraft();
});

function gateway(
  name: string,
  active: boolean,
  state: { reachable: boolean; compatible: boolean } = { reachable: true, compatible: true },
): GatewayInfo {
  return {
    canStop: false,
    canStart: false,
    name,
    endpoint: `https://${name}.example.com`,
    active,
    gatewayState: {
      reachable: state.reachable,
      health: state.reachable ? 'healthy' : 'unknown',
      compatible: state.compatible,
    },
  };
}

function setGateways(gateways: GatewayInfo[]): void {
  vi.mocked(openshellGatewaysStore).openshellGateways.set(gateways);
}

function createButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Create workspace' });
}

async function clickCreate(): Promise<void> {
  await waitFor(() => expect(createButton()).toBeEnabled());
  await fireEvent.click(createButton());
}

function section(label: string): HTMLElement {
  return screen.getByRole('region', { name: label });
}

async function setSourcePath(path: string): Promise<void> {
  await fireEvent.input(within(section('Folders')).getByPlaceholderText('/path/to/project'), {
    target: { value: path },
  });
}

async function editName(name: string): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: 'Edit workspace name' }));
  const input = screen.getByRole('textbox', { name: 'Workspace name' });
  await fireEvent.input(input, { target: { value: name } });
  await fireEvent.keyDown(input, { key: 'Enter' });
}

describe('header', () => {
  test('Expect page title and unnamed workspace displayed by default', () => {
    render(AgentWorkspaceCreate);

    expect(screen.getByText('New workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit workspace name' })).toHaveTextContent('unnamed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('Expect description section expands when toggle clicked', async () => {
    render(AgentWorkspaceCreate);

    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Add a description' }));

    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide description' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('Expect description sent when creating a workspace', async () => {
    wizard.draft.sourcePath = '/home/user/my-repo';
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Add a description' }));
    await fireEvent.input(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Fix the bug' } });
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ description: 'Fix the bug' }));
  });
});

describe('workspace name', () => {
  beforeEach(() => {
    wizard.draft.view = 'list';
  });

  test('Expect workspace name derived from source path', async () => {
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/my-project');

    expect(screen.getByRole('button', { name: 'Edit workspace name' })).toHaveTextContent('my-project');
    expect(wizard.draft.sessionName).toBe('my-project');
  });

  test('Expect basename-derived name sanitized to fit hostname limit', async () => {
    render(AgentWorkspaceCreate);

    await setSourcePath(`/home/user/${'a'.repeat(20)}`);

    expect(wizard.draft.sessionName).toBe('a'.repeat(19));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(createButton()).toBeEnabled());
  });

  test('Expect edited name kept when the source path changes', async () => {
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/my-repo');
    await editName('custom-name');

    expect(screen.queryByRole('textbox', { name: 'Workspace name' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit workspace name' })).toHaveTextContent('custom-name');

    await setSourcePath('/home/user/other-repo');

    expect(screen.getByRole('button', { name: 'Edit workspace name' })).toHaveTextContent('custom-name');
    await clickCreate();
    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'custom-name', sourcePath: '/home/user/other-repo' }),
    );
  });

  test('Expect Escape closes the name input', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Edit workspace name' }));
    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Workspace name' }), { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Workspace name' })).not.toBeInTheDocument();
  });

  test('Expect workspace created with name only when no source path', async () => {
    render(AgentWorkspaceCreate);

    await setSourcePath('   ');
    await editName('my-sandbox');
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePath: undefined, name: 'my-sandbox' }),
    );
  });

  test('Expect Create disabled and error shown when name exceeds hostname limit', async () => {
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/my-repo');
    await editName('a'.repeat(20));

    expect(screen.getByRole('alert')).toHaveTextContent(/must not exceed 19 characters/);
    expect(createButton()).toBeDisabled();
  });

  test('Expect Create disabled and error shown when name is cleared', async () => {
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/my-repo');
    await editName('');

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
  });

  test('Expect Create disabled and error shown when name already used on the selected gateway', async () => {
    vi.mocked(openshellSandboxesStore).allOpenshellSandboxes = writable<(SandboxInfo & { gatewayName: string })[]>([
      { id: 'sb-1', name: 'My-Repo', phase: 'Ready', gatewayName: 'kaiden' },
    ]);
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/my-repo');

    expect(screen.getByRole('alert')).toHaveTextContent('A workspace with this name already exists');
    expect(createButton()).toBeDisabled();
    expect(window.checkAgentWorkspaceGlobalConfigExists).not.toHaveBeenCalled();
  });

  test('Expect name used on another gateway accepted', async () => {
    vi.mocked(openshellSandboxesStore).allOpenshellSandboxes = writable<(SandboxInfo & { gatewayName: string })[]>([
      { id: 'sb-1', name: 'my-repo', phase: 'Ready', gatewayName: 'other' },
    ]);
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/my-repo');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(createButton()).toBeEnabled());
  });
});

describe('gateway', () => {
  test('Expect gateway chip shown and selector hidden when only one gateway is available', () => {
    render(AgentWorkspaceCreate);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('OpenShell gateway · kaiden')).toBeInTheDocument();
    expect(wizard.draft.selectedGateway).toBe('kaiden');
  });

  test('Expect single inactive gateway selected', () => {
    setGateways([gateway('only', false)]);
    render(AgentWorkspaceCreate);

    expect(wizard.draft.selectedGateway).toBe('only');
  });

  test('Expect message and Create disabled when no gateway is reachable', async () => {
    setGateways([gateway('local', true, { reachable: false, compatible: true })]);
    wizard.draft.sourcePath = '/home/user/my-repo';
    render(AgentWorkspaceCreate);

    expect(screen.getByText('No reachable OpenShell gateway')).toBeInTheDocument();
    await vi.waitFor(() => expect(window.listSecrets).toHaveBeenCalled());
    expect(createButton()).toBeDisabled();
  });

  test('Expect gateway selector defaults to the active gateway when multiple gateways are available', async () => {
    setGateways([gateway('local', false), gateway('remote', true)]);
    render(AgentWorkspaceCreate);

    const gatewaySelector = screen.getByRole('combobox');
    expect(gatewaySelector).toHaveValue('remote');

    await fireEvent.change(gatewaySelector, { target: { value: 'local' } });

    expect(gatewaySelector).toHaveValue('local');
    expect(wizard.draft.selectedGateway).toBe('local');
  });

  test('Expect selected gateway included when creating a workspace', async () => {
    setGateways([gateway('local', true), gateway('remote', false)]);
    wizard.draft.sourcePath = '/home/user/my-repo';
    render(AgentWorkspaceCreate);

    await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'remote' } });
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'remote' }));
  });

  test('does not offer gateways while their reachability state is unavailable', () => {
    setGateways([
      { ...gateway('local', true), gatewayState: undefined },
      { ...gateway('remote', false), gatewayState: undefined },
    ]);

    render(AgentWorkspaceCreate);

    expect(screen.queryByRole('option', { name: /local/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /remote/ })).not.toBeInTheDocument();
  });

  test('does not offer unreachable gateways for workspace creation', () => {
    setGateways([
      gateway('local', true),
      gateway('stopped', false, { reachable: false, compatible: true }),
      gateway('remote', false),
    ]);

    render(AgentWorkspaceCreate);

    expect(screen.getByRole('option', { name: /local/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /remote/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /stopped/ })).not.toBeInTheDocument();
  });

  test('does not offer version-incompatible gateways for workspace creation', () => {
    setGateways([
      { ...gateway('compatible-1', true), version: MIN_GATEWAY_VERSION },
      { ...gateway('compatible-2', false), version: MIN_GATEWAY_VERSION },
      { ...gateway('outdated', false, { reachable: true, compatible: false }), version: '0.0.100' },
      gateway('no-version', false, { reachable: true, compatible: false }),
    ]);

    render(AgentWorkspaceCreate);

    expect(screen.getByRole('option', { name: /compatible-1/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /compatible-2/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /outdated/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /no-version/ })).not.toBeInTheDocument();
  });

  test('user-selected gateway is preserved across store updates', async () => {
    setGateways([gateway('local', true), gateway('remote', false)]);
    render(AgentWorkspaceCreate);

    const gatewaySelector = screen.getByRole('combobox');
    expect(gatewaySelector).toHaveValue('local');

    await fireEvent.change(gatewaySelector, { target: { value: 'remote' } });
    setGateways([gateway('local', true), gateway('remote', false)]);

    await waitFor(() => expect(gatewaySelector).toHaveValue('remote'));
  });

  test('falls back to active gateway when selected gateway becomes unreachable', async () => {
    setGateways([gateway('local', true), gateway('remote', false), gateway('extra', false)]);
    render(AgentWorkspaceCreate);

    await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'remote' } });
    expect(screen.getByRole('combobox')).toHaveValue('remote');

    setGateways([
      gateway('local', true),
      gateway('remote', false, { reachable: false, compatible: true }),
      gateway('extra', false),
    ]);

    await waitFor(() => expect(wizard.draft.selectedGateway).toBe('local'));
  });

  test('clears selected gateway when all gateways become unreachable', async () => {
    setGateways([gateway('local', true)]);
    render(AgentWorkspaceCreate);

    expect(wizard.draft.selectedGateway).toBe('local');

    setGateways([gateway('local', true, { reachable: false, compatible: true })]);

    await waitFor(() => expect(wizard.draft.selectedGateway).toBe(''));
  });
});

describe('defaults', () => {
  beforeEach(() => {
    wizard.draft.sourcePath = '/home/user/my-repo';
  });

  test('Expect default agent from onboarding.defaultWorkspaceSettings when valid', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({ defaultAgent: 'claude' });

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.getConfigurationValue).toHaveBeenCalledWith('onboarding.defaultWorkspaceSettings');
    expect(window.createAgentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ agent: 'claude' }));
  });

  test.each([
    { name: 'empty', defaultAgent: '' },
    { name: 'unknown', defaultAgent: 'unknown-agent' },
  ])('Expect default agent falls back to opencode when setting is $name', async ({ defaultAgent }) => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({ defaultAgent });

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'opencode',
        network: { mode: 'deny', hosts: ['registry.npmjs.org', 'pypi.python.org'] },
      }),
    );
  });

  test('Expect default model from onboarding.defaultWorkspaceSettings when valid', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({
      defaultAgent: 'opencode',
      defaultAgentSettings: {
        opencode: { defaultModel: { providerId: 'claude', connectionId: 'conn-0', label: 'claude-opus-4' } },
      },
    });

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'anthropic::claude-opus-4::' }),
    );
  });

  test('Expect first compatible model used when defaultWorkspaceSettings has no model and providers exist', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({ defaultAgent: 'opencode' });
    setProviders([mockAnthropicProvider, mockOllamaProvider]);

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'anthropic::claude-sonnet-4::' }),
    );
  });

  test('Expect first compatible model used when defaultWorkspaceSettings is undefined and providers exist', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue(undefined);
    setProviders([mockOllamaProvider]);

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'ollama::llama3.2:3b::' }),
    );
  });

  test('Expect first model compatible with the default agent skipped when not supported', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({ defaultAgent: 'claude' });
    setProviders([mockOllamaProvider, mockAnthropicProvider]);

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'claude', model: 'anthropic::claude-sonnet-4::' }),
    );
  });

  test('Expect draft already initialized keeps its agent and model', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({ defaultAgent: 'claude' });
    setProviders([mockAnthropicProvider, mockOllamaProvider]);
    wizard.draft.initialized = true;
    wizard.draft.selectedAgent = 'goose';
    wizard.draft.selectedModel = buildCatalogModels([mockOllamaProvider])[0];

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'goose', model: 'ollama::llama3.2:3b::' }),
    );
  });

  test('Expect Create disabled when no model available', async () => {
    setProviders([]);

    render(AgentWorkspaceCreate);

    await vi.waitFor(() => expect(wizard.draft.initialized).toBe(true));
    expect(createButton()).toBeDisabled();
    expect(screen.getByText('No model')).toBeInTheDocument();
  });

  test('Expect createAgentWorkspace called with workspaceConfiguration from settings for selected agent', async () => {
    const workspaceConfiguration = {
      environment: [
        { name: 'CLAUDE_CODE_USE_VERTEX', value: '1' },
        { name: 'CLOUD_ML_REGION', value: 'us-east5' },
      ],
      mounts: [
        {
          host: '$HOME/.config/gcloud/application_default_credentials.json',
          target: '$HOME/.config/gcloud/application_default_credentials.json',
          ro: true,
        },
      ],
    };
    vi.mocked(window.getConfigurationValue).mockResolvedValue({
      defaultAgent: 'claude',
      defaultAgentSettings: {
        claude: {
          defaultModel: { providerId: 'claude', connectionId: 'conn-0', label: 'claude-sonnet-4' },
          workspaceConfiguration,
        },
      },
    });

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'claude', workspaceConfiguration }),
    );
  });

  test('Expect workspaceConfiguration undefined when no settings for selected agent', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({
      defaultAgent: 'opencode',
      defaultAgentSettings: {
        opencode: { defaultModel: { providerId: 'claude', connectionId: 'conn-0', label: 'claude-sonnet-4' } },
        claude: { workspaceConfiguration: { environment: [{ name: 'CLAUDE_CODE_USE_VERTEX', value: '1' }] } },
      },
    });

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'opencode', workspaceConfiguration: undefined }),
    );
  });

  test('Expect workspaceConfiguration follows the agent picked in the Agent card', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({
      defaultAgent: 'opencode',
      defaultAgentSettings: {
        claude: { workspaceConfiguration: { environment: [{ name: 'CLAUDE_CODE_USE_VERTEX', value: '1' }] } },
      },
    });
    wizard.draft.view = 'list';

    render(AgentWorkspaceCreate);
    await vi.waitFor(() => expect(wizard.draft.initialized).toBe(true));
    await fireEvent.click(within(section('Agent')).getByRole('option', { name: /Claude Code/ }));
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'claude',
        workspaceConfiguration: { environment: [{ name: 'CLAUDE_CODE_USE_VERTEX', value: '1' }] },
      }),
    );
  });
});

describe('existing configuration', () => {
  beforeEach(() => {
    wizard.draft.view = 'list';
  });

  test('Expect checkAgentWorkspaceConfigExists called when source path is entered', async () => {
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/my-repo');

    await vi.waitFor(() => expect(window.checkAgentWorkspaceConfigExists).toHaveBeenCalledWith('/home/user/my-repo'));
    expect(screen.queryByText(/existing workspace configuration was found/)).not.toBeInTheDocument();
  });

  test('Expect global configuration checked on the gateway when no source path', async () => {
    vi.mocked(window.checkAgentWorkspaceGlobalConfigExists).mockResolvedValue(true);
    render(AgentWorkspaceCreate);

    await editName('my-sandbox');

    await vi.waitFor(() =>
      expect(window.checkAgentWorkspaceGlobalConfigExists).toHaveBeenCalledWith('kaiden', 'my-sandbox'),
    );
    expect(window.checkAgentWorkspaceConfigExists).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.getByText(/existing workspace configuration was found/)).toBeInTheDocument());
  });

  test('Expect config-exists notification shown when existing config detected', async () => {
    vi.mocked(window.checkAgentWorkspaceConfigExists).mockResolvedValue(true);
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/existing-project');

    await vi.waitFor(() => expect(screen.getByText(/existing workspace configuration was found/)).toBeInTheDocument());
    expect(screen.getByLabelText('Merge with existing')).toBeChecked();
  });

  test('Expect config-exists cleared when the check fails', async () => {
    vi.mocked(window.checkAgentWorkspaceConfigExists).mockRejectedValue(new Error('boom'));
    wizard.draft.configExists = true;
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/my-repo');

    await vi.waitFor(() => expect(wizard.draft.configExists).toBe(false));
    expect(screen.queryByText(/existing workspace configuration was found/)).not.toBeInTheDocument();
  });

  test('Expect replaceConfig passed when Replace existing selected', async () => {
    vi.mocked(window.checkAgentWorkspaceConfigExists).mockResolvedValue(true);
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/existing-project');
    await vi.waitFor(() => expect(screen.getByLabelText('Replace existing')).toBeInTheDocument());
    await fireEvent.click(screen.getByLabelText('Replace existing'));
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ replaceConfig: true }));
  });

  test('Expect replaceConfig not passed when merging with the existing config', async () => {
    vi.mocked(window.checkAgentWorkspaceConfigExists).mockResolvedValue(true);
    render(AgentWorkspaceCreate);

    await setSourcePath('/home/user/existing-project');
    await vi.waitFor(() => expect(screen.getByLabelText('Merge with existing')).toBeInTheDocument());
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: '/home/user/existing-project',
        name: 'existing-project',
        replaceConfig: undefined,
      }),
    );
  });
});

describe('folders', () => {
  beforeEach(() => {
    wizard.draft.view = 'list';
    wizard.draft.sourcePath = '/home/user/my-repo';
  });

  test('Expect browsing for a source folder sets the path and name', async () => {
    vi.mocked(window.openDialog).mockResolvedValue(['/home/user/browsed']);
    render(AgentWorkspaceCreate);

    await fireEvent.click(within(section('Folders')).getByRole('button', { name: 'Browse for folder' }));

    await vi.waitFor(() => expect(wizard.draft.sourcePath).toBe('/home/user/browsed'));
    expect(wizard.draft.sessionName).toBe('browsed');
    expect(window.openDialog).toHaveBeenCalledWith({
      title: 'Select a working directory',
      selectors: ['openDirectory'],
    });
  });

  test('Expect browse failure displayed', async () => {
    vi.mocked(window.openDialog).mockRejectedValue(new Error('dialog failed'));
    render(AgentWorkspaceCreate);

    await fireEvent.click(within(section('Folders')).getByRole('button', { name: 'Browse for folder' }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to browse for directory: dialog failed'));
    expect(wizard.draft.sourcePath).toBe('/home/user/my-repo');
  });

  test('Expect createAgentWorkspace called without mounts when no host filesystem access selected', async () => {
    render(AgentWorkspaceCreate);

    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ mounts: undefined }));
  });

  test('Expect custom mounts section shown when Custom Paths selected', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('radio', { name: 'Use Custom Paths' }));

    expect(screen.getByPlaceholderText('/path/on/host')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Leave empty to place the folder at /sandbox/<folder name>'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Another Mount' })).toBeInTheDocument();
  });

  test('Expect createAgentWorkspace called with custom mounts when Custom Paths selected', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('radio', { name: 'Use Custom Paths' }));
    await fireEvent.input(screen.getByLabelText('Host path 1'), { target: { value: '/home/user/data' } });
    await fireEvent.input(screen.getByLabelText('Target path 1'), { target: { value: '/workspace/data' } });
    expect(screen.getByRole('list', { name: 'Sandbox security' })).toHaveTextContent('Filesystem 2 folders');
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ mounts: [{ host: '/home/user/data', target: '/workspace/data', ro: false }] }),
    );
  });

  test('Expect createAgentWorkspace called with ro:true when read-only toggled for custom mount', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('radio', { name: 'Use Custom Paths' }));
    await fireEvent.input(screen.getByLabelText('Host path 1'), { target: { value: '/home/user/data' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Toggle read-only for mount 1' }));
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ mounts: [{ host: '/home/user/data', target: 'data', ro: true }] }),
    );
  });

  test.each([
    { host: '/home/user/configs', target: 'configs' },
    { host: '/home/user/data/', target: 'data' },
    { host: 'C:\\Users\\alice\\configs', target: 'configs' },
  ])('Expect custom mount $host defaults target to $target', async ({ host, target }) => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('radio', { name: 'Use Custom Paths' }));
    await fireEvent.input(screen.getByLabelText('Host path 1'), { target: { value: host } });
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ mounts: [{ host, target, ro: false }] }),
    );
  });

  test('Expect mounts added, browsed and removed', async () => {
    vi.mocked(window.openDialog).mockResolvedValue(['/home/user/browsed']);
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('radio', { name: 'Use Custom Paths' }));
    await fireEvent.input(screen.getByLabelText('Host path 1'), { target: { value: '/home/user/first' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add Another Mount' }));
    await fireEvent.click(within(section('Folders')).getAllByRole('button', { name: 'Browse for directory' })[1]);
    await vi.waitFor(() => expect(screen.getByLabelText('Host path 2')).toHaveValue('/home/user/browsed'));
    await fireEvent.click(screen.getByRole('button', { name: 'Remove mount 1' }));
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ mounts: [{ host: '/home/user/browsed', target: 'browsed', ro: false }] }),
    );
  });
});

describe('reachable hostnames', () => {
  beforeEach(() => {
    wizard.draft.view = 'list';
    wizard.draft.sourcePath = '/home/user/my-repo';
  });

  function hostList(): HTMLElement {
    return within(section('Reachable hostnames')).getByRole('list', { name: 'Reachable hostnames' });
  }

  test('Expect registry hosts listed by default', () => {
    render(AgentWorkspaceCreate);

    expect(within(hostList()).getByText('registry.npmjs.org')).toBeInTheDocument();
    expect(within(hostList()).getByText('pypi.python.org')).toBeInTheDocument();
  });

  test('Expect host added with the input and Enter sent in the network configuration', async () => {
    render(AgentWorkspaceCreate);

    await userEvent.type(screen.getByRole('textbox', { name: 'Add hostname' }), 'api.example.com{Enter}');

    expect(within(hostList()).getByText('api.example.com')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Add hostname' })).toHaveValue('');
    await clickCreate();
    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        network: { mode: 'deny', hosts: ['registry.npmjs.org', 'pypi.python.org', 'api.example.com'] },
      }),
    );
  });

  test('Expect duplicate host not added twice', async () => {
    render(AgentWorkspaceCreate);

    await userEvent.type(screen.getByRole('textbox', { name: 'Add hostname' }), 'pypi.python.org{Enter}');

    expect(wizard.draft.hostsByMode['registries']).toEqual(['registry.npmjs.org', 'pypi.python.org']);
  });

  test('Expect removed host not sent in the network configuration', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Remove registry.npmjs.org' }));

    expect(within(hostList()).queryByText('registry.npmjs.org')).not.toBeInTheDocument();
    await clickCreate();
    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ network: { mode: 'deny', hosts: ['pypi.python.org'] } }),
    );
  });

  test('Expect deny network without hosts when every host is removed', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Remove registry.npmjs.org' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Remove pypi.python.org' }));

    expect(within(hostList()).getByText('No host is reachable.')).toBeInTheDocument();
    await clickCreate();
    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ network: { mode: 'deny', hosts: undefined } }),
    );
  });

  test('Expect hosts count shown on the blueprint card', async () => {
    wizard.draft.view = 'blueprint';
    render(AgentWorkspaceCreate);

    expect(screen.getByText('2 hosts')).toBeInTheDocument();
  });
});

describe('tools and credentials', () => {
  beforeEach(() => {
    wizard.draft.view = 'list';
    wizard.draft.sourcePath = '/home/user/my-repo';
  });

  test('Expect empty states and management links', async () => {
    render(AgentWorkspaceCreate);

    expect(within(section('Agent')).getByText('No skills available yet.')).toBeInTheDocument();
    expect(within(section('MCP servers')).getByText('No knowledge bases available yet.')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(within(section('Credentials')).getByText('No secrets in your vault yet.')).toBeInTheDocument(),
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Manage Skills' }));
    expect(handleNavigation).toHaveBeenCalledWith({ page: 'skills' });
    await fireEvent.click(screen.getByRole('button', { name: 'Open Vault' }));
    expect(handleNavigation).toHaveBeenCalledWith({ page: 'secret-vault' });
    await fireEvent.click(screen.getByRole('button', { name: 'Manage Knowledges' }));
    expect(handleNavigation).toHaveBeenCalledWith({ page: 'rag-environments' });
  });

  test('Expect only enabled skills listed with their group', () => {
    vi.mocked(skillsStore).skillInfos = writable<SkillInfo[]>([
      { name: 'kubernetes', description: 'Deploy', path: '/skills/kubernetes', enabled: true, managed: false },
      { name: 'code-review', description: 'Review', path: '/skills/code-review', enabled: true, managed: true },
      { name: 'disabled', description: 'Off', path: '/skills/disabled', enabled: false, managed: true },
    ]);

    render(AgentWorkspaceCreate);

    const agent = within(section('Agent'));
    expect(agent.getByText('kubernetes')).toBeInTheDocument();
    expect(agent.getByText('code-review')).toBeInTheDocument();
    expect(agent.queryByText('disabled')).not.toBeInTheDocument();
    expect(agent.getByText('Pre-built')).toBeInTheDocument();
    expect(agent.getByText('Custom')).toBeInTheDocument();
  });

  test('Expect createAgentWorkspace called with selected enabled skill paths', async () => {
    vi.mocked(skillsStore).skillInfos = writable<SkillInfo[]>([
      {
        name: 'kubernetes',
        description: 'Deploy',
        path: '/home/user/.kaiden/skills/kubernetes',
        enabled: true,
        managed: false,
      },
      {
        name: 'code-review',
        description: 'Review',
        path: '/home/user/.kaiden/skills/code-review',
        enabled: true,
        managed: true,
      },
      {
        name: 'disabled',
        description: 'Off',
        path: '/home/user/.kaiden/skills/disabled',
        enabled: false,
        managed: true,
      },
    ]);
    wizard.draft.selectedSkillIds = ['kubernetes', 'code-review', 'disabled'];

    render(AgentWorkspaceCreate);
    await fireEvent.click(within(section('Agent')).getByRole('button', { name: 'code-review' }));
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        skills: ['/home/user/.kaiden/skills/kubernetes', '/home/user/.kaiden/skills/disabled'],
      }),
    );
  });

  test('Expect createAgentWorkspace called without skills, secrets, mcp nor addons when none available', async () => {
    render(AgentWorkspaceCreate);

    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ skills: undefined, secrets: undefined, mcp: undefined, addons: undefined }),
    );
  });

  test('Expect knowledge bases listed with provider display name and source count', () => {
    setProviders([{ id: 'milvus', name: 'Milvus' } as ProviderInfo]);
    vi.mocked(ragStore).ragEnvironments = writable<RagEnvironment[]>([
      {
        name: 'kubernetes-knowledges',
        ragConnection: { name: 'my-connection', providerId: 'milvus' },
        chunkerConnection: { id: 'docling', providerId: 'milvus' },
        mcpServer: { id: 'kb-mcp', name: 'kb-mcp' } as MCPRemoteServerInfo,
        files: [
          { path: '/docs/k8s.md', status: 'indexed' },
          { path: '/docs/pods.md', status: 'indexed' },
        ],
      },
    ]);

    render(AgentWorkspaceCreate);

    const mcp = within(section('MCP servers'));
    expect(mcp.getByText('kubernetes-knowledges')).toBeInTheDocument();
    expect(mcp.getByText('Milvus · 2 sources')).toBeInTheDocument();
  });

  test('Expect createAgentWorkspace splits MCP servers into remote and command entries', async () => {
    vi.mocked(mcpStore).mcpRemoteServerInfos = writable<MCPRemoteServerInfo[]>([
      {
        id: 'mcp-remote',
        name: 'GitHub MCP',
        description: 'Repos & PRs',
        url: 'https://mcp.github.com/sse',
        setupType: 'remote',
        infos: { internalProviderId: 'p1', serverId: 's1', remoteId: 1 },
        tools: { 'list-repos': {} },
      },
      {
        id: 'mcp-pkg',
        name: 'NPM MCP',
        description: 'Node MCP server',
        url: '',
        setupType: 'package',
        commandSpec: { command: 'npx', args: ['@example/mcp@1.0.0'] },
        infos: { internalProviderId: 'p2', serverId: 's2', remoteId: 0 },
        tools: {},
      },
    ]);
    wizard.draft.selectedMcpIds = ['mcp-remote', 'mcp-pkg'];
    wizard.draft.view = 'blueprint';

    render(AgentWorkspaceCreate);
    expect(screen.getByText('GitHub MCP, NPM MCP')).toBeInTheDocument();
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp: {
          servers: [{ name: 'GitHub MCP', url: 'https://mcp.github.com/sse' }],
          commands: [{ name: 'NPM MCP', command: 'npx', args: ['@example/mcp@1.0.0'], env: undefined }],
        },
      }),
    );
  });

  test('Expect secrets listed from the selected gateway', async () => {
    setGateways([gateway('local', true), gateway('remote', false)]);
    vi.mocked(window.listSecrets).mockImplementation(async gatewayName =>
      gatewayName === 'remote'
        ? [
            { name: 'github-token', type: 'github', description: 'Personal access token', gateway: 'remote' },
            { name: 'anthropic-key', type: 'anthropic', description: 'API key', gateway: 'remote' },
          ]
        : [{ name: 'local-only-secret', type: 'generic', description: 'Local only', gateway: 'local' }],
    );

    render(AgentWorkspaceCreate);
    await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'remote' } });

    const credentials = within(section('Credentials'));
    await vi.waitFor(() => expect(credentials.getByText('github-token')).toBeInTheDocument());
    expect(credentials.getByText('anthropic-key')).toBeInTheDocument();
    expect(credentials.getByText('github · Personal access token')).toBeInTheDocument();
    expect(credentials.queryByText('local-only-secret')).not.toBeInTheDocument();
    expect(window.listSecrets).toHaveBeenCalledWith('local');
    expect(window.listSecrets).toHaveBeenLastCalledWith('remote');
  });

  test('Expect unknown secret ids dropped and selected secrets sent', async () => {
    vi.mocked(window.listSecrets).mockResolvedValue([
      { name: 'github-token', type: 'github', gateway: 'kaiden' },
      { name: 'anthropic-key', type: 'anthropic', gateway: 'kaiden' },
    ]);
    wizard.draft.selectedSecretIds = ['github-token', 'removed-secret'];

    render(AgentWorkspaceCreate);

    await vi.waitFor(() => expect(wizard.draft.selectedSecretIds).toEqual(['github-token']));
    await clickCreate();
    expect(window.createAgentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ secrets: ['github-token'] }));
  });

  test('Expect Create disabled while gateway secrets load', async () => {
    let resolveSecrets: (secrets: GatewaySecretInfo[]) => void = () => {};
    vi.mocked(window.listSecrets).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSecrets = resolve;
        }),
    );
    wizard.draft.selectedSecretIds = ['remote-secret'];

    render(AgentWorkspaceCreate);

    await vi.waitFor(() => expect(wizard.draft.initialized).toBe(true));
    expect(createButton()).toBeDisabled();

    resolveSecrets([{ name: 'remote-secret', type: 'generic', gateway: 'kaiden' }]);

    await waitFor(() => expect(createButton()).toBeEnabled());
    expect(wizard.draft.selectedSecretIds).toEqual(['remote-secret']);
  });

  test('Expect secret selection cleared when listing secrets fails', async () => {
    vi.mocked(window.listSecrets).mockRejectedValue(new Error('gateway down'));
    wizard.draft.selectedSecretIds = ['github-token'];

    render(AgentWorkspaceCreate);

    await vi.waitFor(() => expect(wizard.draft.selectedSecretIds).toEqual([]));
    await waitFor(() => expect(createButton()).toBeEnabled());
  });
});

describe('add-ons', () => {
  beforeEach(() => {
    vi.mocked(agentsStore).agentInfos = writable<AgentInfo[]>([
      {
        id: 'opencode',
        name: 'OpenCode',
        description: 'Open-source agent.',
        command: 'opencode',
        destinationSkillsFolder: '/home/test/.opencode/skills',
        supportedModelTypes: [{ name: 'anthropic' }],
        addonImages: ['quay.io/kaiden/opencode:1'],
      },
    ]);
    vi.mocked(addonsStore).addons = writable<Addon[]>([
      {
        id: 'kaiden.opencode',
        name: 'opencode',
        displayName: 'OpenCode CLI',
        publisher: { name: 'kaiden', displayName: 'Kaiden' },
        ociImage: 'quay.io/kaiden/opencode:1',
      },
      {
        id: 'kaiden.playwright',
        name: 'playwright',
        displayName: 'Playwright',
        version: '1.50',
        description: 'Browser automation',
        category: 'Testing',
        publisher: { name: 'kaiden', displayName: 'Kaiden' },
        ociImage: 'quay.io/kaiden/playwright:1',
      },
    ]);
    wizard.draft.sourcePath = '/home/user/my-repo';
  });

  test('Expect addons provided by an agent hidden and selected addons sent', async () => {
    wizard.draft.view = 'list';
    render(AgentWorkspaceCreate);

    const addonsSection = within(section('Add-ons'));
    expect(addonsSection.queryByText('OpenCode CLI')).not.toBeInTheDocument();
    expect(addonsSection.getByText('Browser automation')).toBeInTheDocument();

    await fireEvent.click(addonsSection.getByRole('button', { name: 'Playwright 1.50' }));
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ addons: ['kaiden.playwright'] }),
    );
  });

  test('Expect selected addons shown as chips on the blueprint card', () => {
    wizard.draft.selectedAddonIds = ['kaiden.playwright'];
    render(AgentWorkspaceCreate);

    expect(screen.getByText('Playwright 1.50')).toBeInTheDocument();
  });
});

describe('create', () => {
  test('Expect createAgentWorkspace called with the full options then navigates', async () => {
    vi.mocked(window.getConfigurationValue).mockResolvedValue({
      defaultAgent: 'claude',
      defaultAgentSettings: {
        claude: {
          workspaceConfiguration: {
            environment: [{ name: 'CLAUDE_CODE_USE_VERTEX', value: '1' }],
            mounts: [{ host: '~/.config/gcloud/adc.json', target: '~/.config/gcloud/adc.json', ro: true }],
          },
        },
      },
    });
    vi.mocked(skillsStore).skillInfos = writable<SkillInfo[]>([
      { name: 'kubernetes', description: 'Deploy', path: '/skills/kubernetes', enabled: true, managed: false },
    ]);
    vi.mocked(mcpStore).mcpRemoteServerInfos = writable<MCPRemoteServerInfo[]>([
      {
        id: 'mcp-remote',
        name: 'GitHub MCP',
        description: 'Repos & PRs',
        url: 'https://mcp.github.com/sse',
        setupType: 'remote',
        infos: { internalProviderId: 'p1', serverId: 's1', remoteId: 1 },
        tools: {},
      },
    ]);
    vi.mocked(addonsStore).addons = writable<Addon[]>([
      {
        id: 'kaiden.playwright',
        name: 'playwright',
        displayName: 'Playwright',
        publisher: { name: 'kaiden', displayName: 'Kaiden' },
        ociImage: 'quay.io/kaiden/playwright:1',
      },
    ]);
    vi.mocked(window.listSecrets).mockResolvedValue([{ name: 'github-token', type: 'github', gateway: 'kaiden' }]);
    wizard.draft.sourcePath = '/home/user/my-repo';
    wizard.draft.selectedSkillIds = ['kubernetes'];
    wizard.draft.selectedMcpIds = ['mcp-remote'];
    wizard.draft.selectedSecretIds = ['github-token'];
    wizard.draft.selectedAddonIds = ['kaiden.playwright'];
    wizard.draft.selectedFileAccess = 'custom';
    wizard.draft.customMounts = [{ host: '/data', target: '', ro: true }];

    render(AgentWorkspaceCreate);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith({
      sourcePath: '/home/user/my-repo',
      agent: 'claude',
      image: undefined,
      model: 'anthropic::claude-sonnet-4::',
      gateway: 'kaiden',
      name: 'my-repo',
      description: undefined,
      skills: ['/skills/kubernetes'],
      network: { mode: 'deny', hosts: ['registry.npmjs.org', 'pypi.python.org'] },
      secrets: ['github-token'],
      mounts: [{ host: '/data', target: 'data', ro: true }],
      mcp: { servers: [{ name: 'GitHub MCP', url: 'https://mcp.github.com/sse' }] },
      workspaceConfiguration: {
        environment: [{ name: 'CLAUDE_CODE_USE_VERTEX', value: '1' }],
        mounts: [{ host: '$HOME/.config/gcloud/adc.json', target: '$HOME/.config/gcloud/adc.json', ro: true }],
      },
      replaceConfig: undefined,
      project: undefined,
      addons: ['kaiden.playwright'],
    });
    expect(handleNavigation).toHaveBeenCalledWith({ page: NavigationPage.AGENT_WORKSPACES });
    await vi.waitFor(() => expect(wizard.draft.sourcePath).toBe(''));
  });

  test('Expect custom base image sent when set', async () => {
    wizard.draft.sourcePath = '/home/user/my-repo';
    wizard.draft.initialized = true;
    wizard.draft.selectedModel = buildCatalogModels([mockAnthropicProvider])[0];
    wizard.draft.customImage = ' quay.io/me/image:1 ';

    render(AgentWorkspaceCreate);

    expect(screen.getByText('quay.io/me/image:1')).toBeInTheDocument();
    await clickCreate();
    expect(window.createAgentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ image: 'quay.io/me/image:1' }));
  });

  test('Expect error dialog shown, draft preserved and navigation done when createAgentWorkspace fails', async () => {
    vi.mocked(window.createAgentWorkspace).mockRejectedValue(new Error('sandbox init failed'));
    wizard.draft.sourcePath = '/home/user/my-repo';

    render(AgentWorkspaceCreate);
    await clickCreate();

    await vi.waitFor(() =>
      expect(window.showMessageBox).toHaveBeenCalledWith({
        title: 'Agent Workspace',
        type: 'error',
        message: 'Error while creating workspace: sandbox init failed',
        buttons: ['OK'],
      }),
    );
    expect(handleNavigation).toHaveBeenCalledWith({ page: NavigationPage.AGENT_WORKSPACES });
    expect(wizard.draft.sourcePath).toBe('/home/user/my-repo');
    expect(wizard.draft.sessionName).toBe('my-repo');
  });

  test.each([{ ctrlKey: true }, { metaKey: true }])('Expect $0 + Enter creates the workspace', async modifier => {
    wizard.draft.sourcePath = '/home/user/my-repo';
    render(AgentWorkspaceCreate);

    await waitFor(() => expect(createButton()).toBeEnabled());
    await fireEvent.keyDown(window, { key: 'Enter', ...modifier });

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-repo' }));
    expect(handleNavigation).toHaveBeenCalledWith({ page: NavigationPage.AGENT_WORKSPACES });
  });

  test('Expect Ctrl+Enter ignored while the workspace cannot be created', async () => {
    render(AgentWorkspaceCreate);

    await vi.waitFor(() => expect(wizard.draft.initialized).toBe(true));
    await fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    await fireEvent.keyDown(window, { key: 'Enter' });

    expect(window.createAgentWorkspace).not.toHaveBeenCalled();
    expect(handleNavigation).not.toHaveBeenCalled();
  });

  test('Expect Cancel resets the draft and navigates to workspaces', async () => {
    wizard.draft.sourcePath = '/home/user/my-repo';
    wizard.draft.view = 'list';
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(wizard.draft.sourcePath).toBe('');
    expect(wizard.draft.view).toBe('blueprint');
    expect(handleNavigation).toHaveBeenCalledWith({ page: NavigationPage.AGENT_WORKSPACES });
    expect(window.createAgentWorkspace).not.toHaveBeenCalled();
  });
});

describe('views', () => {
  test('Expect blueprint view by default with every card', () => {
    render(AgentWorkspaceCreate);

    expect(screen.getByRole('radio', { name: 'Blueprint' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('group', { name: 'Sandbox blueprint' })).toBeInTheDocument();
    for (const label of [
      'Model',
      'Agent',
      'Add-ons',
      'Base image',
      'MCP servers',
      'Folders',
      'Reachable hostnames',
      'Credentials',
    ]) {
      expect(screen.getByRole('button', { name: `Edit ${label}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Configure ${label}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Expect list view renders every editor', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('radio', { name: 'List' }));

    expect(wizard.draft.view).toBe('list');
    expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('group', { name: 'Sandbox blueprint' })).not.toBeInTheDocument();
    expect(within(section('Folders')).getByPlaceholderText('/path/to/project')).toBeInTheDocument();
    expect(within(section('Reachable hostnames')).getByRole('textbox', { name: 'Add hostname' })).toBeInTheDocument();
    expect(within(section('Agent')).getByRole('listbox', { name: 'Coding agent' })).toBeInTheDocument();
  });

  test('Expect YAML view previews the create options', async () => {
    wizard.draft.sourcePath = '/home/user/my-repo';
    render(AgentWorkspaceCreate);
    await vi.waitFor(() => expect(wizard.draft.initialized).toBe(true));

    await fireEvent.click(screen.getByRole('radio', { name: 'YAML' }));

    expect(wizard.draft.view).toBe('yaml');
    expect(screen.queryByRole('group', { name: 'Sandbox blueprint' })).not.toBeInTheDocument();
    expect(MonacoEditor).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: expect.stringContaining('name: my-repo'),
        language: 'yaml',
        readOnly: true,
      }),
    );
  });

  test('Expect card popover opened by its edit button and closed by Escape', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Edit Folders' }));

    const dialog = screen.getByRole('dialog', { name: 'Folders' });
    expect(within(dialog).getByPlaceholderText('/path/to/project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Folders' })).toHaveAttribute('aria-expanded', 'true');

    await fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Expect edit button toggles the card popover', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Edit Credentials' }));
    expect(screen.getByRole('dialog', { name: 'Credentials' })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Edit Credentials' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Expect blueprint dot opens its card and only one popover is open', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Configure Model' }));
    expect(screen.getByRole('dialog', { name: 'Model' })).toBeInTheDocument();

    await fireEvent.keyDown(screen.getByRole('button', { name: 'Configure Reachable hostnames' }), { key: 'Enter' });

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Reachable hostnames' })).toBeInTheDocument();
  });

  test('Expect switching view closes the open popover', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Edit Add-ons' }));
    expect(screen.getByRole('dialog', { name: 'Add-ons' })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('radio', { name: 'List' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Blueprint' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Expect editing in a popover updates the card value', async () => {
    render(AgentWorkspaceCreate);

    await fireEvent.click(screen.getByRole('button', { name: 'Edit Folders' }));
    await fireEvent.input(screen.getByPlaceholderText('/path/to/project'), { target: { value: '/home/user/my-repo' } });

    expect(screen.getByText('1 mounted · 1 writable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit workspace name' })).toHaveTextContent('my-repo');
  });
});

const sampleProject: WorkspaceProjectInfo = {
  id: 'my-app',
  name: 'My App',
  description: 'A sample project',
  folder: '/home/user/my-app',
  skills: ['kubernetes'],
  mcpServers: ['mcp-github'],
  knowledges: [],
  secrets: ['github-token'],
  filesystem: { mode: 'project', mounts: [] },
  network: { mode: 'deny', hosts: ['registry.npmjs.org'] },
};

function setProjects(projects: WorkspaceProjectInfo[]): void {
  vi.mocked(workspaceProjectsStore).workspaceProjectInfos = writable<readonly WorkspaceProjectInfo[]>(projects);
}

async function selectProject(name: RegExp): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: /Saved project/ }));
  await fireEvent.click(screen.getByRole('option', { name }));
}

describe('when projects exist', () => {
  beforeEach(() => {
    setProjects([sampleProject]);
    wizard.draft.view = 'list';
    vi.mocked(window.listSecrets).mockResolvedValue([{ name: 'github-token', type: 'github', gateway: 'kaiden' }]);
  });

  test('project handoff shows the selection and preserves edits when project data changes', async () => {
    initializeDraftFromProject(sampleProject);
    render(AgentWorkspaceCreate);

    expect(screen.getByRole('option', { name: /My App/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue(sampleProject.folder);
    await editName('edited-name');
    workspaceProjectsStore.workspaceProjectInfos.set([
      { ...sampleProject, name: 'Updated project', folder: '/updated' },
    ]);

    await waitFor(() => expect(screen.getByRole('option', { name: /Updated project/ })).toBeVisible());
    expect(screen.getByRole('button', { name: 'Edit workspace name' })).toHaveTextContent('edited-name');
    expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue(sampleProject.folder);
    expect(wizard.draft.selectedProjectId).toBe(sampleProject.id);
  });

  test('Expect project selection cards rendered after expanding accordion', async () => {
    render(AgentWorkspaceCreate);

    expect(screen.queryByRole('option', { name: /My App/ })).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /Saved project/ }));

    expect(screen.getByRole('option', { name: /None/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /My App/ })).toBeInTheDocument();
  });

  test('Expect selecting a project pre-fills the draft', async () => {
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);

    expect(screen.getByPlaceholderText('/path/to/project')).toHaveValue('/home/user/my-app');
    expect(screen.getByRole('button', { name: 'Edit workspace name' })).toHaveTextContent('my-app');
    expect(wizard.draft.selectedSkillIds).toEqual(['kubernetes']);
    expect(wizard.draft.selectedMcpIds).toEqual(['mcp-github']);
    expect(wizard.draft.selectedSecretIds).toEqual(['github-token']);
    expect(wizard.draft.selectedNetwork).toBe('blocked');
    expect(wizard.draft.hostsByMode['blocked']).toEqual(['registry.npmjs.org']);
  });

  test('Expect createAgentWorkspace called with project id', async () => {
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'my-app',
        sourcePath: '/home/user/my-app',
        secrets: ['github-token'],
        network: { mode: 'deny', hosts: ['registry.npmjs.org'] },
      }),
    );
  });

  test('Expect createAgentWorkspace called without project when None selected', async () => {
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);
    await fireEvent.click(screen.getByRole('option', { name: /None/ }));
    await setSourcePath('/home/user/other-repo');
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ project: undefined, name: 'other-repo' }),
    );
  });

  test('Expect clearing project resets draft fields', async () => {
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);
    expect(wizard.draft.selectedProjectId).toBe('my-app');

    await fireEvent.click(screen.getByRole('option', { name: /None/ }));

    expect(wizard.draft.selectedProjectId).toBeUndefined();
    expect(wizard.draft.sourcePath).toBe('');
    expect(wizard.draft.sessionName).toBe('');
    expect(wizard.draft.selectedNetwork).toBe('registries');
    expect(wizard.draft.hostsByMode['registries']).toEqual(['registry.npmjs.org', 'pypi.python.org']);
  });

  test('Expect clearing project restores all-selected defaults for resources', async () => {
    vi.mocked(skillsStore).skillInfos = writable<SkillInfo[]>([
      { name: 'kubernetes', description: 'K8s', path: '/skills/k8s', enabled: true, managed: false },
      { name: 'docker', description: 'Docker', path: '/skills/docker', enabled: true, managed: false },
    ]);
    vi.mocked(mcpStore).mcpRemoteServerInfos = writable<MCPRemoteServerInfo[]>([
      { id: 'mcp-1', name: 'MCP One', description: '', url: '', infos: {}, tools: {} } as MCPRemoteServerInfo,
    ]);

    render(AgentWorkspaceCreate);

    await selectProject(/My App/);
    expect(wizard.draft.selectedSkillIds).toEqual(['kubernetes']);
    expect(wizard.draft.selectedMcpIds).toEqual(['mcp-github']);

    await fireEvent.click(screen.getByRole('option', { name: /None/ }));

    expect(wizard.draft.selectedSkillIds).toEqual(['kubernetes', 'docker']);
    expect(wizard.draft.selectedMcpIds).toEqual(['mcp-1']);
  });
});

describe('project filesystem mapping', () => {
  beforeEach(() => {
    wizard.draft.view = 'list';
  });

  test('Expect allow network maps to registries', async () => {
    wizard.draft.hostsByMode = { ...wizard.draft.hostsByMode, registries: ['stale.example.com'] };
    setProjects([{ ...sampleProject, id: 'open-net', network: { mode: 'allow' } }]);
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);

    expect(wizard.draft.selectedNetwork).toBe('registries');
    expect(wizard.draft.hostsByMode['registries']).toEqual(['registry.npmjs.org', 'pypi.python.org']);
  });

  test('Expect deny network without hosts mapped to blocked mode', async () => {
    setProjects([{ ...sampleProject, id: 'blocked', network: { mode: 'deny' } }]);
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);

    expect(wizard.draft.selectedNetwork).toBe('blocked');
    expect(screen.getByText('No host is reachable.')).toBeInTheDocument();
  });

  test('Expect deny network with registry preset hosts mapped to registries mode', async () => {
    setProjects([
      {
        ...sampleProject,
        id: 'registry-preset',
        network: { mode: 'deny', hosts: ['registry.npmjs.org', 'pypi.python.org'] },
      },
    ]);
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);

    expect(wizard.draft.selectedNetwork).toBe('registries');
    expect(wizard.draft.hostsByMode['registries']).toEqual(['registry.npmjs.org', 'pypi.python.org']);
  });

  test('Expect deny network with custom hosts listed and editable in blocked mode', async () => {
    setProjects([{ ...sampleProject, id: 'custom-hosts', network: { mode: 'deny', hosts: ['internal.corp.local'] } }]);
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);

    expect(wizard.draft.selectedNetwork).toBe('blocked');
    const hostList = within(section('Reachable hostnames')).getByRole('list', { name: 'Reachable hostnames' });
    expect(within(hostList).getByText('internal.corp.local')).toBeInTheDocument();
    expect(within(hostList).queryByText('registry.npmjs.org')).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: 'Add hostname' }), 'api.corp.local{Enter}');
    await clickCreate();

    expect(window.createAgentWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ network: { mode: 'deny', hosts: ['internal.corp.local', 'api.corp.local'] } }),
    );
  });

  test.each([
    { name: 'home', mounts: [{ host: '$HOME', target: '$HOME', ro: false }] },
    { name: 'root', mounts: [{ host: '/', target: '/', ro: false }] },
    { name: 'custom', mounts: [{ host: '/data', target: '/workspace/data', ro: true }] },
  ])('Expect $name mount mapped to custom file access', async ({ mounts }) => {
    setProjects([{ ...sampleProject, id: 'mounts', filesystem: { mode: 'custom', mounts } }]);
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);

    expect(wizard.draft.selectedFileAccess).toBe('custom');
    expect(wizard.draft.customMounts).toEqual(mounts);
    expect(screen.getByRole('radio', { name: 'Use Custom Paths' })).toBeChecked();
  });

  test('Expect empty mounts mapped to workspace file access', async () => {
    wizard.draft.selectedFileAccess = 'custom';
    setProjects([{ ...sampleProject, id: 'no-mounts', filesystem: { mode: 'project', mounts: [] } }]);
    render(AgentWorkspaceCreate);

    await selectProject(/My App/);

    expect(wizard.draft.selectedFileAccess).toBe('workspace');
  });
});
