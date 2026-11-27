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

import { assert, beforeEach, describe, expect, test } from 'vitest';

import { resetDraft, wizard } from '/@/kaiden/stores/agent-workspace-create-draft.svelte';
import { SANDBOX_NAME_MAX_LENGTH } from '/@api/agent-workspace-info';
import type { MCPRemoteServerInfo } from '/@api/mcp/mcp-server-info';
import type { ModelInfo } from '/@api/model-registry-info';
import type { SkillInfo } from '/@api/skill/skill-info';

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

const model: ModelInfo = {
  providerId: 'provider',
  connectionId: 'connection',
  connectionName: 'Connection',
  type: 'cloud',
  label: 'my-model',
  endpoint: 'https://api.example.com/v1',
  llmMetadata: { name: 'openai' },
};

const remoteServer: MCPRemoteServerInfo = {
  id: 'github',
  infos: { internalProviderId: 'p', serverId: 'github', remoteId: 0 },
  name: 'GitHub',
  description: '',
  url: 'https://api.github.com/mcp',
  setupType: 'remote',
  tools: {},
};

const packageServer: MCPRemoteServerInfo = {
  id: 'postgres',
  infos: { internalProviderId: 'p', serverId: 'postgres', remoteId: 1 },
  name: 'PostgreSQL',
  description: '',
  url: '',
  setupType: 'package',
  commandSpec: { command: 'npx', args: ['pg-mcp'], env: { A: 'b' } },
  tools: {},
};

const skills: SkillInfo[] = [
  { name: 'k8s', description: '', path: '/skills/k8s', enabled: true, managed: false },
  { name: 'docker', description: '', path: '/skills/docker', enabled: true, managed: false },
];

beforeEach(() => {
  resetDraft();
});

test.each([
  ['/home/user/my-project/', 'my-project'],
  ['C:\\work\\api', 'api'],
  ['', ''],
])('getDefaultSessionName(%j) is %j', (path, expected) => {
  expect(getDefaultSessionName(path)).toBe(expected);
});

describe('getEffectiveWorkspaceName', () => {
  test('falls back to the folder name', () => {
    wizard.draft.sourcePath = '/home/user/payments';
    expect(getEffectiveWorkspaceName(wizard.draft)).toBe('payments');
  });

  test('keeps an empty name the user cleared', () => {
    wizard.draft.sourcePath = '/home/user/payments';
    wizard.draft.nameManuallyEdited = true;
    expect(getEffectiveWorkspaceName(wizard.draft)).toBe('');
  });
});

describe('getWorkspaceNameError', () => {
  test('no error while the name is empty and untouched', () => {
    expect(getWorkspaceNameError(wizard.draft, [])).toBeUndefined();
  });

  test('a cleared name is an error', () => {
    wizard.draft.nameManuallyEdited = true;
    expect(getWorkspaceNameError(wizard.draft, [])).toBeTruthy();
  });

  test.each([
    'My Project',
    'has space',
    '-leading',
    'trailing-',
    'a--b',
    'a'.repeat(SANDBOX_NAME_MAX_LENGTH + 1),
  ])('%j is invalid', name => {
    wizard.draft.sessionName = name;
    expect(getWorkspaceNameError(wizard.draft, [])).toBeTruthy();
  });

  test('a folder-derived name is validated too', () => {
    wizard.draft.sourcePath = `/src/${'a'.repeat(SANDBOX_NAME_MAX_LENGTH + 1)}`;
    expect(getWorkspaceNameError(wizard.draft, [])).toBeTruthy();
  });

  test('a name at the hostname limit is valid', () => {
    wizard.draft.sessionName = 'a'.repeat(SANDBOX_NAME_MAX_LENGTH);
    expect(getWorkspaceNameError(wizard.draft, [])).toBeUndefined();
  });

  test('a name used on the same gateway is a duplicate', () => {
    wizard.draft.sessionName = 'payments';
    wizard.draft.selectedGateway = 'local';
    expect(getWorkspaceNameError(wizard.draft, [{ gatewayName: 'local', name: 'Payments' }])).toMatch(/already exists/);
    expect(getWorkspaceNameError(wizard.draft, [{ gatewayName: 'remote', name: 'payments' }])).toBeUndefined();
  });
});

describe('buildCreateOptions', () => {
  test('returns undefined without a model', () => {
    expect(buildCreateOptions(wizard.draft, { skills, mcpServers: [] })).toBeUndefined();
  });

  test('maps the whole draft', () => {
    Object.assign(wizard.draft, {
      selectedModel: model,
      selectedAgent: 'claude',
      selectedGateway: 'local',
      sessionName: ' payments ',
      sourcePath: '/src/payments',
      customImage: ' fedora:45 ',
      selectedSkillIds: ['docker'],
      selectedMcpIds: ['github', 'postgres'],
      selectedSecretIds: ['token'],
      selectedFileAccess: 'custom',
      customMounts: [
        { host: '/data/', target: '', ro: true },
        { host: ' ', target: '/ignored', ro: false },
      ],
      selectedAddonIds: ['kaiden.node'],
      configExists: true,
      configAction: 'replace',
    });

    const options = buildCreateOptions(wizard.draft, {
      skills,
      mcpServers: [remoteServer, packageServer],
      workspaceConfiguration: { mounts: [{ host: '~/.config', target: '~/.config', ro: true }] },
    });

    expect(options).toEqual({
      sourcePath: '/src/payments',
      agent: 'claude',
      image: 'fedora:45',
      model: 'openai::my-model::https://api.example.com/v1',
      gateway: 'local',
      name: 'payments',
      description: undefined,
      skills: ['/skills/docker'],
      network: { mode: 'deny', hosts: ['registry.npmjs.org', 'pypi.python.org'] },
      secrets: ['token'],
      mounts: [{ host: '/data/', target: 'data', ro: true }],
      mcp: {
        servers: [{ name: 'GitHub', url: 'https://api.github.com/mcp' }],
        commands: [{ name: 'PostgreSQL', command: 'npx', args: ['pg-mcp'], env: { A: 'b' } }],
      },
      workspaceConfiguration: { mounts: [{ host: '$HOME/.config', target: '$HOME/.config', ro: true }] },
      replaceConfig: true,
      project: undefined,
      addons: ['kaiden.node'],
    });
  });

  test('omits empty selections and denies all hosts when none is listed', () => {
    wizard.draft.selectedModel = model;
    wizard.draft.selectedNetwork = 'blocked';
    const options = buildCreateOptions(wizard.draft, { skills, mcpServers: [] });
    assert(options);
    expect(options.network).toEqual({ mode: 'deny', hosts: undefined });
    expect(options.mounts).toBeUndefined();
    expect(options.mcp).toBeUndefined();
    expect(options.addons).toBeUndefined();
  });
});

describe('folders summary', () => {
  test('counts the source folder and custom mounts', () => {
    wizard.draft.sourcePath = '/src';
    wizard.draft.selectedFileAccess = 'custom';
    wizard.draft.customMounts = [
      { host: '/a', target: '', ro: true },
      { host: '/b', target: '', ro: false },
    ];
    const summary = summarizeFolders(wizard.draft);
    expect(summary).toEqual({ mounted: 3, writable: 2 });
    expect(formatFoldersSummary(summary)).toBe('3 mounted · 2 writable');
  });

  test('ignores custom mounts when host access is off', () => {
    wizard.draft.customMounts = [{ host: '/a', target: '', ro: false }];
    expect(formatFoldersSummary(summarizeFolders(wizard.draft))).toBe('No host folder');
  });
});

test.each([
  [[], 'None'],
  [['GitHub'], 'GitHub'],
  [['GitHub', 'PostgreSQL'], 'GitHub, PostgreSQL'],
  [['a', 'b', 'c', 'd'], 'a, b +2'],
])('formatNames(%j) is %j', (names, expected) => {
  expect(formatNames(names, 'None')).toBe(expected);
});

test('getReachableHosts lists the model endpoint then the listed hosts, without duplicates', () => {
  wizard.draft.selectedModel = model;
  wizard.draft.hostsByMode = {
    ...wizard.draft.hostsByMode,
    registries: ['registry.npmjs.org', '*.acme.dev', 'api.example.com', ''],
  };

  expect(getReachableHosts(wizard.draft)).toEqual([
    { host: 'api.example.com', source: 'model', removable: false },
    { host: 'registry.npmjs.org', source: 'registry', removable: true },
    { host: '*.acme.dev', source: 'custom', removable: true },
  ]);
});

describe('toYaml', () => {
  test('prints a hint without options', () => {
    expect(toYaml(undefined)).toContain('select a model');
  });

  test('omits undefined members', () => {
    expect(toYaml({ agent: 'claude', model: 'm', gateway: 'local', image: undefined })).toBe(
      'agent: claude\nmodel: m\ngateway: local\n',
    );
  });
});
