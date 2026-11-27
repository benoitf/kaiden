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

import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import AgentWorkspaceBlueprint from './AgentWorkspaceBlueprint.svelte';

let onSelectStep: (stepId: string) => void;
let onCreate: () => void;
let onCancel: () => void;

function renderBlueprint(overrides: Partial<{ canCreate: boolean; addonCount: number; mcpCount: number }> = {}): void {
  render(AgentWorkspaceBlueprint, {
    name: 'payments-refactor',
    image: 'fedora:45',
    agent: 'Claude Code',
    model: 'Sonnet',
    addonCount: 0,
    mcpCount: 0,
    folderCount: 2,
    writableCount: 1,
    hostCount: 3,
    activeStepId: 'model',
    canCreate: true,
    readyMessage: 'Ready to create now',
    onSelectStep,
    onCreate,
    onCancel,
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  onSelectStep = vi.fn();
  onCreate = vi.fn();
  onCancel = vi.fn();
});

test('shows the layer values, the active layer and the draft tag', () => {
  renderBlueprint();

  expect(screen.getByText('fedora:45')).toBeInTheDocument();
  expect(screen.getByText('Claude Code')).toBeInTheDocument();
  expect(screen.getByText('Sonnet')).toBeInTheDocument();
  expect(screen.getByText('Model · editing')).toBeInTheDocument();
  expect(screen.getByText('payments-refactor · OpenShell · draft')).toBeInTheDocument();
});

test('shows the stats', () => {
  renderBlueprint({ mcpCount: 2, addonCount: 4 });

  expect(screen.getByText('2 attached')).toBeInTheDocument();
  expect(screen.getByText('4 selected')).toBeInTheDocument();
  expect(screen.getByText('2 · 1 writable')).toBeInTheDocument();
  expect(screen.getByText('3 allowed')).toBeInTheDocument();
  expect(screen.getByText(/2 mounted folders/)).toBeInTheDocument();
});

test.each([
  ['Edit Image', 'image'],
  ['Edit Add-ons label', 'addons'],
  ['Edit MCP servers', 'mcp'],
  ['Edit Hostnames', 'hostnames'],
])('clicking %s selects step %s', async (name, stepId) => {
  renderBlueprint();

  await fireEvent.click(screen.getByRole('button', { name }));

  expect(onSelectStep).toHaveBeenCalledWith(stepId);
});

test('keyboard Enter on a label selects the step', async () => {
  renderBlueprint();

  await fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Folders' }), { key: 'Enter' });

  expect(onSelectStep).toHaveBeenCalledWith('folders');
});

test('create and cancel buttons call their handlers', async () => {
  renderBlueprint();

  expect(screen.getByText('Ready to create now')).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(onCreate).toHaveBeenCalledOnce();
  expect(onCancel).toHaveBeenCalledOnce();
});

test('create button is disabled when the workspace cannot be created', () => {
  renderBlueprint({ canCreate: false });

  expect(screen.getByRole('button', { name: 'Create workspace' })).toBeDisabled();
});
