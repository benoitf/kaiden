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

import { expect, type Locator, type Page } from '@playwright/test';

import {
  type CodingAgent,
  FILE_ACCESS_LEVEL,
  type FileAccessLevel,
  NETWORK_ACCESS_LEVEL,
  type NetworkAccessLevel,
  TIMEOUTS,
  type WorkspaceCustomMount,
} from '/@/model/core/types';

import type { InlineConnectionField, ResolvedAgentModelSetup } from './agent-model-setup';
import { BasePage } from './base-page';

export type AgentModelSetup = (createPage: AgentWorkspaceCreatePage) => Promise<void>;

export {
  agentModelSetupSkipMessage,
  agentModelSetupSkipMessageFor,
  buildInlineConnectionFields,
  type InlineConnectionField,
  isAgentModelSetupAvailable,
  isLocalRuntimeAvailable,
  resolveAgentModelConnection,
  resolveAgentModelConnectionFor,
  type ResolvedAgentModelSetup,
} from './agent-model-setup';

export const BLUEPRINT_CARD = {
  MODEL: 'Model',
  AGENT: 'Agent',
  ADDONS: 'Add-ons',
  BASE_IMAGE: 'Base image',
  MCP_SERVERS: 'MCP servers',
  FOLDERS: 'Folders',
  HOSTNAMES: 'Reachable hostnames',
  CREDENTIALS: 'Credentials',
} as const;
export const BLUEPRINT_CARDS = Object.values(BLUEPRINT_CARD);
export type BlueprintCard = (typeof BLUEPRINT_CARD)[keyof typeof BLUEPRINT_CARD];

export const CREATE_VIEW = {
  BLUEPRINT: 'Blueprint',
  LIST: 'List',
  YAML: 'YAML',
} as const;
export type CreateView = (typeof CREATE_VIEW)[keyof typeof CREATE_VIEW];

export class AgentWorkspaceCreatePage extends BasePage {
  readonly heading: Locator;
  readonly editNameButton: Locator;
  readonly sessionNameInput: Locator;
  readonly workingDirInput: Locator;
  readonly browseButton: Locator;
  readonly descriptionToggle: Locator;
  readonly descriptionInput: Locator;
  readonly viewSelector: Locator;
  readonly agentSelector: Locator;
  readonly mcpServersPanel: Locator;
  readonly fileAccessHeading: Locator;
  readonly firstCustomPathInput: Locator;
  readonly addPathButton: Locator;
  readonly addHostInput: Locator;
  readonly cancelButton: Locator;
  readonly submitButton: Locator;
  readonly noModelsGate: Locator;
  readonly providerPicker: Locator;
  readonly inlineConnectionForm: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole('heading', { name: 'New workspace', exact: true });
    this.editNameButton = this.page.getByRole('button', { name: 'Edit workspace name', exact: true });
    this.sessionNameInput = this.page.getByRole('textbox', { name: 'Workspace name', exact: true });
    this.workingDirInput = this.page.getByPlaceholder('/path/to/project');
    this.browseButton = this.page.getByLabel('Browse for folder');
    this.descriptionToggle = this.page.getByRole('button', { name: /^(Add a|Hide) description$/ });
    this.descriptionInput = this.page.getByRole('textbox', { name: 'Description' });
    this.viewSelector = this.page.getByRole('radiogroup', { name: 'View' });
    this.agentSelector = this.page.getByRole('listbox', { name: 'Coding agent' });
    this.mcpServersPanel = this.page.getByText('MCP Servers', { exact: true });
    this.fileAccessHeading = this.page.getByText('File System Access');
    this.firstCustomPathInput = this.page.getByPlaceholder('/path/on/host').first();
    this.addPathButton = this.page.getByRole('button', { name: 'Add Another Mount' });
    this.addHostInput = this.page.getByRole('textbox', { name: 'Add hostname', exact: true });
    this.cancelButton = this.page.getByRole('button', { name: 'Cancel', exact: true });
    this.submitButton = this.page.getByRole('button', { name: 'Create workspace', exact: true });
    this.noModelsGate = this.page.getByTestId('no-models-create-connection');
    this.providerPicker = this.page.getByTestId('provider-picker');
    this.inlineConnectionForm = this.page.getByTestId('inline-connection-form');
  }

  async waitForLoad(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: TIMEOUTS.SHORT });
    // The draft store persists the selected view across mounts: start from the Blueprint.
    await this.selectView(CREATE_VIEW.BLUEPRINT);
  }

  getViewOption(view: CreateView): Locator {
    return this.viewSelector.getByRole('radio', { name: view, exact: true });
  }

  async selectView(view: CreateView): Promise<void> {
    const option = this.getViewOption(view);
    if ((await option.getAttribute('aria-checked')) !== 'true') {
      await option.click();
    }
    await expect(option).toHaveAttribute('aria-checked', 'true');
  }

  getEditButton(card: BlueprintCard): Locator {
    return this.page.getByRole('button', { name: `Edit ${card}`, exact: true });
  }

  getEditorDialog(card: BlueprintCard): Locator {
    return this.page.getByRole('dialog', { name: card, exact: true });
  }

  getListSection(card: BlueprintCard): Locator {
    return this.page.getByRole('region', { name: card, exact: true });
  }

  /** Makes the editor of a card visible (popover in Blueprint view, section in List view) and returns it. */
  async openEditor(card: BlueprintCard): Promise<Locator> {
    if ((await this.getViewOption(CREATE_VIEW.LIST).getAttribute('aria-checked')) === 'true') {
      const section = this.getListSection(card);
      await expect(section).toBeVisible();
      return section;
    }
    const dialog = this.getEditorDialog(card);
    if (!(await dialog.isVisible())) {
      // another open popover may cover the Edit button
      await this.closeEditors();
      await this.getEditButton(card).click();
    }
    await expect(dialog).toBeVisible();
    return dialog;
  }

  /** Closes the open popover by clicking outside it (Escape would also leave the page). */
  async closeEditors(): Promise<void> {
    const dialogs = this.page.getByRole('dialog');
    if ((await dialogs.count()) > 0) {
      await this.heading.click();
    }
    await expect(dialogs).toHaveCount(0);
  }

  async fillWorkspaceName(name: string): Promise<void> {
    if (!(await this.sessionNameInput.isVisible())) {
      await this.editNameButton.click();
    }
    await this.sessionNameInput.fill(name);
    await this.sessionNameInput.press('Enter');
    await expect(this.editNameButton).toContainText(name);
  }

  async fillWorkingDir(path: string): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.FOLDERS);
    await this.workingDirInput.fill(path);
  }

  async fillDescription(desc: string): Promise<void> {
    if (!(await this.descriptionInput.isVisible())) {
      await this.descriptionToggle.click();
      await expect(this.descriptionInput).toBeVisible();
    }
    await this.descriptionInput.fill(desc);
  }

  getAgentCard(agent: CodingAgent): Locator {
    return this.agentSelector.getByRole('option').filter({ has: this.page.getByText(agent, { exact: true }) });
  }

  async selectAgent(agent: CodingAgent): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.AGENT);
    const card = this.getAgentCard(agent);
    if ((await card.getAttribute('aria-selected')) !== 'true') {
      await card.click();
    }
    await expect(card).toHaveAttribute('aria-selected', 'true');
  }

  async expectAgentSelected(agent: CodingAgent): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.AGENT);
    await expect(this.getAgentCard(agent)).toHaveAttribute('aria-selected', 'true');
  }

  async getSelectedModelLabel(): Promise<string> {
    await this.openEditor(BLUEPRINT_CARD.MODEL);
    const selected = this.page.getByTestId('selected-model');
    if (await selected.isVisible()) {
      const text = await selected.textContent();
      return text?.replace(/^Selected:\s*/, '').trim() ?? '';
    }
    const checked = this.page.locator('input[name="modelSelection"]:checked');
    await expect(checked).toBeVisible();
    const ariaLabel = await checked.getAttribute('aria-label');
    return ariaLabel?.replace(/^Use\s+/, '') ?? '';
  }

  async expectModelSelected(modelLabel: string): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.MODEL);
    const row = this.page.getByTestId(`model-row-${modelLabel}`);
    await expect(row.locator('input[name="modelSelection"]')).toBeChecked();
    await expect(this.page.getByTestId('selected-model')).toHaveText(`Selected: ${modelLabel}`);
  }

  getCardByName(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }

  getFileAccessOption(level: FileAccessLevel): Locator {
    return this.page.getByRole('button', { name: level, exact: true });
  }

  async selectFileAccess(level: FileAccessLevel): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.FOLDERS);
    await this.getFileAccessOption(level).click();
    await expect(this.page.getByRole('radio', { name: `Use ${level}` })).toBeChecked();
  }

  getCustomMountHostInput(index = 0): Locator {
    return this.page.getByLabel(`Host path ${index + 1}`);
  }

  getCustomMountTargetInput(index = 0): Locator {
    return this.page.getByLabel(`Target path ${index + 1}`);
  }

  async fillCustomMount(mount: WorkspaceCustomMount, index = 0): Promise<void> {
    await this.getCustomMountHostInput(index).fill(mount.host);
    if (mount.target !== undefined) {
      await this.getCustomMountTargetInput(index).fill(mount.target);
    }
    if (mount.readOnly) {
      const toggle = this.page.getByRole('button', { name: `Toggle read-only for mount ${index + 1}` });
      const label = await toggle.textContent();
      if (label?.includes('read-write')) {
        await toggle.click();
      }
    }
  }

  async configureCustomMount(mount: WorkspaceCustomMount, index = 0): Promise<void> {
    await this.selectFileAccess(FILE_ACCESS_LEVEL.CUSTOM_PATHS);
    await this.fillCustomMount(mount, index);
  }

  getHostRemoveButton(host: string): Locator {
    return this.page.getByRole('button', { name: `Remove ${host}`, exact: true });
  }

  getReachableHost(host: string): Locator {
    return this.page.getByRole('list', { name: 'Reachable hostnames' }).getByRole('listitem').filter({ hasText: host });
  }

  async addHost(host: string): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.HOSTNAMES);
    await this.addHostInput.fill(host);
    await this.addHostInput.press('Enter');
    await expect(this.getReachableHost(host)).toBeVisible();
  }

  async removeHost(host: string): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.HOSTNAMES);
    await this.getHostRemoveButton(host).click();
    await expect(this.getHostRemoveButton(host)).not.toBeVisible();
  }

  /** Removes every removable host (registries and custom ones); only the model endpoint stays reachable. */
  async removeAllHosts(): Promise<void> {
    const editor = await this.openEditor(BLUEPRINT_CARD.HOSTNAMES);
    const removeButtons = editor.getByRole('button', { name: /^Remove / });
    while ((await removeButtons.count()) > 0) {
      const before = await removeButtons.count();
      await removeButtons.first().click();
      await expect(removeButtons).toHaveCount(before - 1);
    }
  }

  /**
   * The page has no network mode picker anymore: everything not listed in Reachable hostnames is blocked.
   * Deny All maps to removing the default registry hosts, Developer Preset to keeping them.
   */
  async configureNetworkingStep(
    network: NetworkAccessLevel,
    options?: { denyHosts?: string[]; additionalHosts?: string[] },
  ): Promise<void> {
    const hosts = network === NETWORK_ACCESS_LEVEL.DENY_ALL ? options?.denyHosts : options?.additionalHosts;
    if (network === NETWORK_ACCESS_LEVEL.DENY_ALL) {
      await this.removeAllHosts();
    }
    for (const host of hosts ?? []) {
      await this.addHost(host);
    }
  }

  async configureFileSystemStep(fileAccess: FileAccessLevel, customMounts?: WorkspaceCustomMount[]): Promise<void> {
    if (fileAccess === FILE_ACCESS_LEVEL.CUSTOM_PATHS) {
      const mounts = customMounts ?? [];
      if (mounts.length === 0) {
        throw new Error('Custom Paths requires at least one mount');
      }
      await this.configureCustomMount(mounts[0]!, 0);
      for (let index = 1; index < mounts.length; index++) {
        await this.addPathButton.click();
        await this.fillCustomMount(mounts[index]!, index);
      }
      return;
    }
    await this.selectFileAccess(fileAccess);
  }

  async completeSandboxWizardSteps(options: {
    fileAccess: FileAccessLevel;
    customMounts?: WorkspaceCustomMount[];
    network: NetworkAccessLevel;
    denyHosts?: string[];
    additionalHosts?: string[];
  }): Promise<void> {
    await this.configureFileSystemStep(options.fileAccess, options.customMounts);
    await this.configureNetworkingStep(options.network, {
      denyHosts: options.denyHosts,
      additionalHosts: options.additionalHosts,
    });
  }

  async cancel(): Promise<void> {
    await expect(this.cancelButton).toBeEnabled();
    await this.cancelButton.click();
  }

  async closeIfOpen(): Promise<void> {
    if (await this.heading.isVisible().catch(() => false)) {
      await this.cancel();
    }
  }

  async startWorkspace(): Promise<void> {
    // Create workspace is disabled while no gateway is reachable: surface that cause explicitly.
    try {
      await expect(this.submitButton).toBeEnabled({ timeout: TIMEOUTS.STANDARD });
    } catch (error) {
      await this.assertGatewayAvailable();
      throw error;
    }
    await this.submitButton.click();
  }

  get modelList(): Locator {
    return this.page.getByRole('table', { name: /models/ });
  }

  async waitForModelCatalog(timeout: number = TIMEOUTS.DEFAULT): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.MODEL);
    await expect
      .poll(async () => await this.getModelTableRows().count(), {
        timeout,
        intervals: [500, 1_000, 2_000],
        message: 'Model catalog did not populate in workspace wizard',
      })
      .toBeGreaterThan(0);
    await expect(this.modelList.first()).toBeVisible({ timeout: TIMEOUTS.STANDARD });
  }

  get modelSearchInput(): Locator {
    return this.page.getByRole('searchbox', { name: 'Filter catalog models' });
  }

  async searchModel(term: string): Promise<void> {
    await expect(this.modelSearchInput).toBeVisible();
    await this.modelSearchInput.fill(term);
    await expect(this.getModelTableRows().first()).toBeVisible();
  }

  getModelTableRows(): Locator {
    return this.page.locator('[data-testid^="model-row-"]');
  }

  getModelRowRuntime(row: Locator): Locator {
    return row.locator('td').nth(3);
  }

  async selectDefaultModel(): Promise<string> {
    return this.selectRadio(this.page.locator('input[name="modelSelection"]').first());
  }

  async selectModelByRuntime(runtime: string): Promise<string> {
    const row = this.getModelTableRows()
      .filter({ has: this.page.getByRole('cell', { name: runtime, exact: true }) })
      .first();
    return this.selectRadio(row.locator('input[name="modelSelection"]'));
  }

  async verifyModelRuntimes(expectedRuntime: string): Promise<void> {
    const rows = this.getModelTableRows();
    const count = await rows.count();
    expect(count, 'Expected at least one model row').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const runtimeCell = this.getModelRowRuntime(rows.nth(i));
      await expect(runtimeCell).toHaveText(expectedRuntime);
    }
  }

  async searchAndSelectByRuntime(searchTerm: string, runtime: string): Promise<string> {
    await this.searchModel(searchTerm);
    return this.selectModelByRuntime(runtime);
  }

  async searchAndSelectDefault(searchTerm: string, verifyRuntime?: string): Promise<string> {
    await this.searchModel(searchTerm);
    if (verifyRuntime) {
      await this.verifyModelRuntimes(verifyRuntime);
    }
    return this.selectDefaultModel();
  }

  async searchAndSelectModel(modelLabel: string): Promise<string> {
    await this.searchModel(modelLabel);
    return this.selectRadio(this.page.getByRole('radio', { name: `Use ${modelLabel}`, exact: true }));
  }

  async isModelCatalogVisible(): Promise<boolean> {
    return (await this.getModelTableRows().count()) > 0;
  }

  async selectConnectionProvider(providerName: string): Promise<void> {
    if (await this.providerPicker.isVisible()) {
      const button = this.providerPicker.getByRole('button', {
        name: new RegExp(`Select ${providerName}`, 'i'),
      });
      await expect(button).toBeVisible();
      await button.click();
    }
    await expect(this.inlineConnectionForm).toBeVisible();
  }

  async fillInlineConnectionFields(fields: InlineConnectionField[]): Promise<void> {
    for (const field of fields) {
      const input = this.inlineConnectionForm.getByLabel(field.label);
      await expect(input).toBeVisible();
      await this.fillSecret(input, field.value);
    }
  }

  async submitInlineConnection(): Promise<void> {
    const createButton = this.inlineConnectionForm.getByRole('button', { name: 'Create' });
    await expect(createButton).toBeEnabled();
    await createButton.click();
  }

  async ensureModelReady(setup: ResolvedAgentModelSetup): Promise<void> {
    await this.openEditor(BLUEPRINT_CARD.MODEL);
    if (await this.isModelCatalogVisible()) {
      await this.selectDefaultModel();
    } else if (await this.noModelsGate.isVisible()) {
      await this.selectConnectionProvider(setup.providerName);
      await this.fillInlineConnectionFields(setup.fields);
      try {
        await this.submitInlineConnection();
      } finally {
        for (const field of setup.fields) {
          await this.inlineConnectionForm
            .getByLabel(field.label)
            .fill('')
            .catch(() => {});
        }
      }
      await this.waitForModelCatalog();
      await this.selectDefaultModel();
    } else {
      await this.waitForModelCatalog();
      await this.selectDefaultModel();
    }
  }

  async completeAvailableAgentModelStep(setup: ResolvedAgentModelSetup): Promise<void> {
    await this.selectAgent(setup.agent);
    await this.ensureModelReady(setup);
  }

  async completeAgentModelStepIfNeeded(setup: AgentModelSetup): Promise<void> {
    if (await this.submitButton.isDisabled()) {
      await setup(this);
    }
  }

  private async selectRadio(radio: Locator): Promise<string> {
    await expect(radio).toBeVisible();
    if (!(await radio.isChecked())) {
      await radio.click();
    }
    await expect(radio).toBeChecked();
    const ariaLabel = await radio.getAttribute('aria-label');
    return ariaLabel?.replace(/^Use\s+/, '') ?? '';
  }
}
