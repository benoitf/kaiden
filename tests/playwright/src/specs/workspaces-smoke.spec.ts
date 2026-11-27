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

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, workerTest as test } from '/@/fixtures/electron-app';
import { CODING_AGENTS, FILE_ACCESS_LEVEL, FILE_ACCESS_LEVELS, MCP_SERVERS } from '/@/model/core/types';
import {
  type AgentModelSetup,
  agentModelSetupSkipMessage,
  AgentWorkspaceCreatePage,
  BLUEPRINT_CARD,
  BLUEPRINT_CARDS,
  CREATE_VIEW,
  resolveAgentModelConnection,
} from '/@/model/pages/agent-workspace-create-page';
import { waitForNavigationReady } from '/@/utils/app-ready';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_SKILL = {
  file: resolve(__dirname, '../../../../.agents/skills/playwright-testing/SKILL.md'),
  name: 'playwright-testing',
};

test.skip(
  !!process.env.GITHUB_ACTIONS && process.platform !== 'linux' && !process.env.PODMAN_ENABLED,
  'Workspaces smoke requires an OpenShell gateway with the Podman driver, which is not available on macOS/Windows GitHub Actions runners',
);

const completeAgentModelStep: AgentModelSetup = async (createPage: AgentWorkspaceCreatePage): Promise<void> => {
  const connection = resolveAgentModelConnection();
  test.skip(!connection, agentModelSetupSkipMessage());
  await createPage.completeAvailableAgentModelStep(connection!);
};

test.afterEach(async ({ page }) => {
  await new AgentWorkspaceCreatePage(page).closeIfOpen();
});

test.describe('Workspaces page - initial state', { tag: '@smoke' }, () => {
  test.beforeEach(async ({ page, navigationBar }) => {
    await waitForNavigationReady(page);
    await navigationBar.navigateToWorkspacesPage();
  });

  test('[WKS-INIT-01] Renders with heading, create button, search and empty state', async ({ agentWorkspacesPage }) => {
    await expect(agentWorkspacesPage.heading).toBeVisible();
    await expect(agentWorkspacesPage.createButton).toBeVisible();
    await expect(agentWorkspacesPage.createButton).toBeEnabled();
    await expect(agentWorkspacesPage.searchInput).toBeVisible();
    await expect(agentWorkspacesPage.noWorkspacesMessage).toBeVisible();
    await expect(agentWorkspacesPage.table).not.toBeVisible();
  });

  test('[WKS-INIT-02] Search shows no-results state and clears filter', async ({ agentWorkspacesPage }) => {
    await agentWorkspacesPage.search('non-existent-workspace-xyz');
    await expect(agentWorkspacesPage.filteredEmptyMessage).toBeVisible();
    await expect(agentWorkspacesPage.clearFilterButton).toBeVisible();

    await agentWorkspacesPage.clearFilterButton.click();
    await expect(agentWorkspacesPage.filteredEmptyMessage).not.toBeVisible();
    await expect(agentWorkspacesPage.searchInput).toHaveValue('');
  });
});

test.describe('Workspaces page - create page', { tag: '@smoke' }, () => {
  const testWorkspace = {
    name: 'test-workspace',
    workingDir: '/tmp/test-project',
    description: 'A test workspace',
  };

  test.beforeEach(async ({ page, navigationBar }) => {
    await waitForNavigationReady(page);
    await navigationBar.ensureExtensionsRunning();
    await navigationBar.navigateToWorkspacesPage();
  });

  test('[WKS-WIZ-01] Opens the blueprint with every card editable', async ({ agentWorkspacesPage }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await expect(createPage.heading).toBeVisible();
    await expect(createPage.editNameButton).toBeVisible();
    await expect(createPage.cancelButton).toBeEnabled();
    await expect(createPage.submitButton).toBeVisible();
    for (const card of BLUEPRINT_CARDS) {
      await expect(createPage.getEditButton(card)).toBeVisible();
    }

    await createPage.openEditor(BLUEPRINT_CARD.FOLDERS);
    await expect(createPage.workingDirInput).toBeVisible();
    await expect(createPage.browseButton).toBeVisible();
    await createPage.closeEditors();
  });

  test('[WKS-WIZ-02] Form fields retain filled values', async ({ agentWorkspacesPage }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.fillWorkingDir(testWorkspace.workingDir);
    await createPage.fillWorkspaceName(testWorkspace.name);
    await createPage.fillDescription(testWorkspace.description);

    await expect(createPage.editNameButton).toContainText(testWorkspace.name);
    await expect(createPage.descriptionInput).toHaveValue(testWorkspace.description);
    await createPage.openEditor(BLUEPRINT_CARD.FOLDERS);
    await expect(createPage.workingDirInput).toHaveValue(testWorkspace.workingDir);
  });

  test('[WKS-WIZ-03] Displays all coding agents and allows selection', async ({ agentWorkspacesPage }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.openEditor(BLUEPRINT_CARD.AGENT);
    await expect(createPage.agentSelector).toBeVisible();
    for (const agent of CODING_AGENTS) {
      await expect(createPage.getAgentCard(agent)).toBeVisible();
      await createPage.selectAgent(agent);
    }
  });

  test('[WKS-WIZ-04] List view renders every editor as a section', async ({ agentWorkspacesPage }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.selectView(CREATE_VIEW.LIST);
    for (const card of BLUEPRINT_CARDS) {
      await expect(createPage.getListSection(card)).toBeVisible();
    }
    await expect(createPage.getEditButton(BLUEPRINT_CARD.MODEL)).not.toBeVisible();
  });

  test('[WKS-WIZ-05] Shows custom path inputs only for Custom Paths access level', async ({ agentWorkspacesPage }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.openEditor(BLUEPRINT_CARD.FOLDERS);
    await expect(createPage.fileAccessHeading).toBeVisible();
    for (const level of FILE_ACCESS_LEVELS) {
      await createPage.selectFileAccess(level);

      if (level === FILE_ACCESS_LEVEL.CUSTOM_PATHS) {
        await expect(createPage.firstCustomPathInput).toBeVisible();
        await expect(createPage.addPathButton).toBeVisible();
      } else {
        await expect(createPage.addPathButton).not.toBeVisible();
      }
    }
  });

  test('[WKS-WIZ-06] Adds and removes a reachable hostname', async ({ agentWorkspacesPage }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.addHost('api.example.com');
    await createPage.removeHost('api.example.com');
    await expect(createPage.getReachableHost('api.example.com')).not.toBeVisible();
  });

  test('[WKS-WIZ-08] Cancel exits the create page', async ({ agentWorkspacesPage }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();
    await createPage.cancel();
    await expect(agentWorkspacesPage.heading).toBeVisible();
  });

  test('[WKS-WIZ-09] Create workspace enables once a folder is set and a model is available', async ({
    agentWorkspacesPage,
  }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.fillWorkingDir(testWorkspace.workingDir);
    await createPage.completeAgentModelStepIfNeeded(completeAgentModelStep);

    await expect(createPage.submitButton).toBeEnabled();
  });

  test('[WKS-WIZ-10] Configures every card and Create workspace is available', async ({ agentWorkspacesPage }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.fillWorkingDir(testWorkspace.workingDir);
    await createPage.fillWorkspaceName(testWorkspace.name);
    await createPage.fillDescription(testWorkspace.description);
    await completeAgentModelStep(createPage);
    await createPage.selectFileAccess(FILE_ACCESS_LEVEL.NO_HOST_ACCESS);
    await createPage.closeEditors();

    await expect(createPage.submitButton).toBeEnabled();
  });
});

test.describe('Workspaces page - create without project folder', { tag: '@smoke' }, () => {
  test.beforeEach(async ({ page, navigationBar }) => {
    await waitForNavigationReady(page);
    await navigationBar.ensureExtensionsRunning();
    await navigationBar.navigateToWorkspacesPage();
  });

  test('[WKS-NOFOLDER-01] Create workspace enables with a name and a model but no folder', async ({
    agentWorkspacesPage,
  }) => {
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.fillWorkspaceName('no-folder-workspace');
    await completeAgentModelStep(createPage);
    await createPage.closeEditors();

    await expect(createPage.submitButton).toBeEnabled();
  });
});

test.describe('Workspaces page - skills integration', { tag: '@smoke' }, () => {
  test.beforeAll(async ({ page, electronApp, navigationBar, skillsPage }) => {
    await waitForNavigationReady(page);
    const settingsPage = await navigationBar.navigateToSettingsPage();
    await settingsPage.openSkills();
    await skillsPage.importSkill(TEST_SKILL.file, electronApp);
    await skillsPage.ensureRowExists(TEST_SKILL.name);
  });

  test.afterAll(async ({ navigationBar, skillsPage }) => {
    const settingsPage = await navigationBar.navigateToSettingsPage();
    await settingsPage.openSkills();
    await skillsPage.deleteSkillByName(TEST_SKILL.name);
    await skillsPage.ensureRowDoesNotExist(TEST_SKILL.name);
  });

  test.beforeEach(async ({ page }) => {
    await waitForNavigationReady(page);
  });

  test('[WKS-SKILL-01] Imported skill appears in the Agent editor', async ({ navigationBar, agentWorkspacesPage }) => {
    await navigationBar.navigateToWorkspacesPage();
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.openEditor(BLUEPRINT_CARD.AGENT);

    await expect(createPage.getCardByName(TEST_SKILL.name)).toBeVisible();
  });
});

test.describe('Workspaces page - MCP integration', { tag: '@smoke' }, () => {
  const githubServer = MCP_SERVERS.github;
  const hasGithubToken = !!process.env[githubServer.envVarName];

  test.skip(!hasGithubToken, `${githubServer.envVarName} environment variable is not set`);

  test.beforeAll(async ({ page, navigationBar, mcpPage }) => {
    await waitForNavigationReady(page);
    const settingsPage = await navigationBar.navigateToSettingsPage();
    await settingsPage.openMcp();
    await mcpPage.createServer(githubServer.serverName, process.env[githubServer.envVarName]!);
  });

  test.afterAll(async ({ navigationBar, mcpPage }) => {
    const settingsPage = await navigationBar.navigateToSettingsPage();
    await settingsPage.openMcp();
    await mcpPage.deleteServer(githubServer.serverName);
  });

  test.beforeEach(async ({ page }) => {
    await waitForNavigationReady(page);
  });

  test('[WKS-MCP-01] Configured server appears in the MCP servers editor', async ({
    navigationBar,
    agentWorkspacesPage,
  }) => {
    await navigationBar.navigateToWorkspacesPage();
    const createPage = await agentWorkspacesPage.openCreatePage();

    await createPage.openEditor(BLUEPRINT_CARD.MCP_SERVERS);

    await expect(createPage.mcpServersPanel).toBeVisible();
    await expect(createPage.getCardByName(githubServer.serverName)).toBeVisible();
  });
});
