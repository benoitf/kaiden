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

import AgentWorkspaceCreateStepWorkspace from './AgentWorkspaceCreateStepWorkspace.svelte';

const defaultProps = {
  sourcePath: '',
  projectOpen: false,
  onBrowseSource: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetAllMocks();
});

test('Expect project folder label and input are rendered', () => {
  render(AgentWorkspaceCreateStepWorkspace, defaultProps);

  expect(screen.getByText(/Project folder/)).toBeInTheDocument();
  expect(screen.getByPlaceholderText('/path/to/project')).toBeInTheDocument();
});

test('Expect browse button calls onBrowseSource', async () => {
  const onBrowseSource = vi.fn();
  render(AgentWorkspaceCreateStepWorkspace, { ...defaultProps, onBrowseSource });

  await fireEvent.click(screen.getByRole('button', { name: 'Browse for folder' }));

  expect(onBrowseSource).toHaveBeenCalledOnce();
});

test('Expect source input renders initial value', () => {
  render(AgentWorkspaceCreateStepWorkspace, { ...defaultProps, sourcePath: '/home/user/project' });

  expect((screen.getByPlaceholderText('/path/to/project') as HTMLInputElement).value).toBe('/home/user/project');
});

test('shows config-exists notification when configExists is true', () => {
  render(AgentWorkspaceCreateStepWorkspace, {
    ...defaultProps,
    configExists: true,
  });

  expect(screen.getByText(/existing workspace configuration was found/)).toBeInTheDocument();
});

test('hides config-exists notification when configExists is false', () => {
  render(AgentWorkspaceCreateStepWorkspace, defaultProps);

  expect(screen.queryByText(/existing workspace configuration was found/)).not.toBeInTheDocument();
});

test('shows merge/replace radio buttons when configExists is true', () => {
  render(AgentWorkspaceCreateStepWorkspace, {
    ...defaultProps,
    configExists: true,
    configAction: 'merge',
  });

  expect(screen.getByLabelText('Merge with existing')).toBeInTheDocument();
  expect(screen.getByLabelText('Replace existing')).toBeInTheDocument();
});

test('selects replace radio when clicked', async () => {
  render(AgentWorkspaceCreateStepWorkspace, {
    ...defaultProps,
    configExists: true,
    configAction: 'merge',
  });

  await fireEvent.click(screen.getByLabelText('Replace existing'));

  expect(screen.getByLabelText('Replace existing')).toBeChecked();
});
