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

import AgentWorkspaceBlueprintCard from './AgentWorkspaceBlueprintCard.svelte';

const onopen = vi.fn();
const onclose = vi.fn();

function renderCard(open: boolean, chips?: string[]): void {
  render(AgentWorkspaceBlueprintCard, {
    id: 'model',
    label: 'Model',
    value: 'Claude Sonnet',
    color: 'model',
    chips,
    align: 'left',
    open,
    onopen,
    onclose,
    children: createRawSnippet(() => ({ render: (): string => '<p>model editor</p>' })),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

test('shows the label and value, without the editor when closed', () => {
  renderCard(false);

  expect(screen.getByText('Model')).toBeInTheDocument();
  expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit Model' })).toHaveAttribute('aria-expanded', 'false');
});

test('shows chips instead of the value', () => {
  renderCard(false, ['node 24', 'rust']);

  expect(screen.getByText('node 24')).toBeInTheDocument();
  expect(screen.getByText('rust')).toBeInTheDocument();
  expect(screen.queryByText('Claude Sonnet')).not.toBeInTheDocument();
});

test('the edit button opens a closed card', async () => {
  renderCard(false);

  await fireEvent.click(screen.getByRole('button', { name: 'Edit Model' }));

  expect(onopen).toHaveBeenCalled();
  expect(onclose).not.toHaveBeenCalled();
});

test('an open card renders the editor and the edit button closes it', async () => {
  renderCard(true);

  expect(screen.getByRole('dialog', { name: 'Model' })).toHaveTextContent('model editor');
  await fireEvent.click(screen.getByRole('button', { name: 'Edit Model' }));

  expect(onclose).toHaveBeenCalled();
  expect(onopen).not.toHaveBeenCalled();
});

test('Escape inside an open card closes it without reaching the page', async () => {
  renderCard(true);
  const pageListener = vi.fn();
  window.addEventListener('keydown', pageListener);

  await fireEvent.keyDown(screen.getByText('model editor'), { key: 'Escape' });
  window.removeEventListener('keydown', pageListener);

  expect(onclose).toHaveBeenCalled();
  expect(pageListener).not.toHaveBeenCalled();
});

test('a click outside closes an open card, not a click inside', async () => {
  renderCard(true);

  await fireEvent.mouseDown(screen.getByText('model editor'));
  expect(onclose).not.toHaveBeenCalled();

  await fireEvent.mouseDown(document.body);
  expect(onclose).toHaveBeenCalled();
});
