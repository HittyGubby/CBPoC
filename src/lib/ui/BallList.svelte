<script lang="ts">
  import { findCountry } from '../data/countries';
  import { ballRadiusFraction, createBallDef, resolveBallFlag, type SceneState } from '../types';

  let { scene }: { scene: SceneState } = $props();

  function addBall(): void {
    const def = createBallDef('US', false);
    // the app assigns a spawn position (top-center with jitter) on creation
    scene.balls.push(def);
    scene.selectedBallId = def.id;
  }

  function controlBall(id: string): void {
    for (const b of scene.balls) b.controlled = b.id === id;
  }

  function deleteBall(id: string): void {
    const idx = scene.balls.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const wasControlled = scene.balls[idx].controlled;
    scene.balls.splice(idx, 1);
    if (scene.selectedBallId === id) scene.selectedBallId = scene.balls[0]?.id ?? null;
    if (wasControlled && scene.balls.length > 0) {
      scene.balls[0].controlled = true;
    }
  }
</script>

<div class="space-y-1">
  <button class="btn btn-sm btn-primary w-full" onclick={addBall}>添加球体</button>
  {#each scene.balls as def (def.id)}
    {@const info = findCountry(def.country)}
    <div
      class:border-primary={scene.selectedBallId === def.id}
      class="flex items-center gap-2 p-2 rounded-box border border-base-300 cursor-pointer hover:bg-base-200"
      role="button"
      tabindex="0"
      onclick={() => (scene.selectedBallId = def.id)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scene.selectedBallId = def.id; } }}
    >
      <img src={resolveBallFlag(def)} alt="" class="w-8 h-5 object-cover rounded border border-base-300" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium truncate">{def.name}</div>
        <div class="text-xs opacity-60 truncate">
          {info ? info.name + ' · ' : '自定义 · '}
          {(ballRadiusFraction(def, scene.world) * 100).toFixed(0)}%
        </div>
      </div>
      <button
        class:btn-primary={def.controlled}
        class="btn btn-xs btn-outline"
        title={def.controlled ? '当前受控' : '设为受控球'}
        onclick={(e) => {
          e.stopPropagation();
          controlBall(def.id);
        }}
      >
        {def.controlled ? '控制中' : '控制'}
      </button>
      <button
        class="btn btn-xs btn-ghost whitespace-nowrap"
        title="删除"
        onclick={(e) => {
          e.stopPropagation();
          deleteBall(def.id);
        }}
      >删除</button>
    </div>
  {/each}
</div>
