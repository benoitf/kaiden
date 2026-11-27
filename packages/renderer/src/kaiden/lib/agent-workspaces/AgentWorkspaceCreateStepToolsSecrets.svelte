<script lang="ts">
import { faBook, faKey, faServer, faWrench } from '@fortawesome/free-solid-svg-icons';
import { Button } from '@podman-desktop/ui-svelte';
import { router } from 'tinro';

import type { ChecklistItem } from '/@/lib/ui/ChecklistPanel.svelte';
import ChecklistPanel from '/@/lib/ui/ChecklistPanel.svelte';
import { handleNavigation } from '/@/navigation';
import { NavigationPage } from '/@api/navigation-page';

type Section = 'skills' | 'mcp' | 'secrets' | 'knowledge';

interface Props {
  skillItems: ChecklistItem[];
  selectedSkillIds: string[];
  mcpItems: ChecklistItem[];
  selectedMcpIds: string[];
  secretItems: ChecklistItem[];
  selectedSecretIds: string[];
  knowledgeItems: ChecklistItem[];
  selectedKnowledgeIds: string[];
  /** Only render these checklists. Defaults to `undefined` (all). */
  sections?: Section[];
}

let {
  skillItems,
  selectedSkillIds = $bindable(),
  mcpItems,
  selectedMcpIds = $bindable(),
  secretItems,
  selectedSecretIds = $bindable(),
  knowledgeItems,
  selectedKnowledgeIds = $bindable(),
  sections,
}: Props = $props();

function shows(section: Section): boolean {
  return !sections || sections.includes(section);
}

function navigateToSkills(): void {
  handleNavigation({ page: NavigationPage.SKILLS });
}

function navigateToMcp(): void {
  router.goto('/preferences/mcps');
}

function navigateToSecretVault(): void {
  handleNavigation({ page: NavigationPage.SECRET_VAULT });
}

function navigateToKnowledges(): void {
  handleNavigation({ page: NavigationPage.RAG_ENVIRONMENTS });
}
</script>

<div class="space-y-6">
  {#if shows('skills')}
    <ChecklistPanel
      title="Skills"
      subtitle="Select the capabilities your agent should have"
      icon={faWrench}
      items={skillItems}
      bind:selected={selectedSkillIds}
      emptyMessage="No skills available yet.">
      {#snippet headerAction()}
        <Button type="secondary" onclick={navigateToSkills}>Manage Skills</Button>
      {/snippet}
    </ChecklistPanel>
  {/if}

  {#if shows('mcp')}
    <ChecklistPanel
      title="MCP Servers"
      subtitle="Connect to Model Context Protocol servers for extended capabilities"
      icon={faServer}
      items={mcpItems}
      bind:selected={selectedMcpIds}
      emptyMessage="No MCP servers available yet.">
      {#snippet headerAction()}
        <Button type="secondary" onclick={navigateToMcp}>Manage Servers</Button>
      {/snippet}
    </ChecklistPanel>
  {/if}

  {#if shows('secrets')}
    <ChecklistPanel
      title="Secret Vault"
      subtitle="Select secrets from your vault to make available in the workspace"
      icon={faKey}
      items={secretItems}
      bind:selected={selectedSecretIds}
      emptyMessage="No secrets in your vault yet.">
      {#snippet headerAction()}
        <Button type="secondary" onclick={navigateToSecretVault}>Open Vault</Button>
      {/snippet}
    </ChecklistPanel>
  {/if}

  {#if shows('knowledge')}
    <ChecklistPanel
      title="Knowledges"
      subtitle="Optional retrieval context for the agent"
      icon={faBook}
      items={knowledgeItems}
      bind:selected={selectedKnowledgeIds}
      emptyMessage="No knowledge bases available yet.">
      {#snippet headerAction()}
        <Button type="secondary" onclick={navigateToKnowledges}>Manage Knowledges</Button>
      {/snippet}
    </ChecklistPanel>
  {/if}
</div>
