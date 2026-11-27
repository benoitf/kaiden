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
import { createRawSnippet } from 'svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import AgentWorkspaceCreateStepCard from './AgentWorkspaceCreateStepCard.svelte';

const children = createRawSnippet(() => ({ render: (): string => '<p>step body</p>' }));
const summary = createRawSnippet(() => ({ render: (): string => '<span>summary text</span>' }));

let onOpen: () => void;
let onContinue: () => void;
let onBack: () => void;

beforeEach(() => {
  vi.resetAllMocks();
  onOpen = vi.fn();
  onContinue = vi.fn();
  onBack = vi.fn();
});

test('active card shows its body, heading, chip, hint and navigation buttons', async () => {
  render(AgentWorkspaceCreateStepCard, {
    index: 3,
    title: 'Model',
    state: 'active',
    chip: 'for Claude Code',
    hint: 'The list follows the agent you picked',
    children,
    onOpen,
    onContinue,
    onBack,
  });

  expect(screen.getByRole('heading', { name: 'Model' })).toBeInTheDocument();
  expect(screen.getByText('for Claude Code')).toBeInTheDocument();
  expect(screen.getByText('The list follows the agent you picked')).toBeInTheDocument();
  expect(screen.getByText('step body')).toBeVisible();

  await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

  expect(onContinue).toHaveBeenCalledOnce();
  expect(onBack).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Edit Model' })).not.toBeInTheDocument();
});

test('continue button can be disabled', () => {
  render(AgentWorkspaceCreateStepCard, {
    index: 3,
    title: 'Model',
    state: 'active',
    continueDisabled: true,
    children,
    onOpen,
    onContinue,
  });

  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
});

test.each([
  ['done' as const, 'Change'],
  ['pending' as const, '4'],
])('collapsed %s card hides its body and opens on click', async (state, marker) => {
  render(AgentWorkspaceCreateStepCard, { index: 4, title: 'Add-ons', state, summary, children, onOpen, onContinue });

  expect(screen.getByText('step body')).not.toBeVisible();
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  expect(screen.getByText('summary text')).toBeInTheDocument();
  expect(screen.getByText(marker)).toBeInTheDocument();

  await fireEvent.click(screen.getByRole('button', { name: 'Edit Add-ons' }));

  expect(onOpen).toHaveBeenCalledOnce();
});

test('collapsed card shows its badge instead of Change', () => {
  render(AgentWorkspaceCreateStepCard, {
    index: 6,
    title: 'Folders',
    state: 'done',
    badge: 'Default',
    children,
    onOpen,
  });

  expect(screen.getByText('Default')).toBeInTheDocument();
  expect(screen.queryByText('Change')).not.toBeInTheDocument();
});
