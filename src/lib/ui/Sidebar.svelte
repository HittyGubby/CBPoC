<script lang="ts">
  import type { SceneState } from '../types';
  import BallList from './BallList.svelte';
  import BallEditor from './BallEditor.svelte';
  import WorldEditor from './WorldEditor.svelte';

  let { scene }: { scene: SceneState } = $props();
  let tab = $state<'balls' | 'world'>('balls');
</script>

<div class="flex flex-col h-full">
  <div class="p-2 border-b border-base-300 flex items-center justify-between">
    <h2 class="text-sm font-bold">CountryBall 管理台</h2>
    <div class="flex items-center gap-1">
      <div class="join">
        <button class:btn-active={tab === 'balls'} class="btn btn-xs join-item" onclick={() => (tab = 'balls')}>球体</button>
        <button class:btn-active={tab === 'world'} class="btn btn-xs join-item" onclick={() => (tab = 'world')}>世界</button>
      </div>
      <button
        class="btn btn-xs btn-ghost btn-circle"
        title="收缩侧栏"
        aria-label="收缩侧栏"
        onclick={() => (scene.sidebarCollapsed = true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </div>
  <div class="flex-1 overflow-y-auto p-2 space-y-2">
    {#if tab === 'balls'}
      <BallList {scene} />
      <BallEditor {scene} />
    {:else}
      <WorldEditor {scene} />
    {/if}
  </div>
</div>
