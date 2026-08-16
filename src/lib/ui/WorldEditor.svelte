<script lang="ts">
  import type { SceneState } from '../types';
  import { resetScene } from '../storage';

  let { scene }: { scene: SceneState } = $props();
  const w = $derived(scene.world);
</script>

<div class="card bg-base-200 rounded-box p-3 space-y-2">
  <h3 class="text-sm font-semibold">舞台 / 物理 / 全局参数</h3>

  <div class="grid grid-cols-2 gap-2">
    <label class="form-control">
      <span class="label-text text-xs">背景色</span>
      <input type="color" class="input input-xs input-bordered h-8 w-full p-1" bind:value={w.background} />
    </label>
    <label class="form-control">
      <span class="label-text text-xs">重力 (R/s²)</span>
      <input type="number" class="input input-xs input-bordered" min="0" max="200" step="1" bind:value={w.gravity} />
    </label>
    <label class="form-control">
      <span class="label-text text-xs">整体缩放 (÷)</span>
      <input type="number" class="input input-xs input-bordered" min="20" max="2000" step="10" bind:value={w.overallScale} title="国家大小除数：radius = (ln(area)+offset)/scale" />
    </label>
    <label class="form-control">
      <span class="label-text text-xs">最大球数</span>
      <input type="number" class="input input-xs input-bordered" min="1" max="200" step="1" bind:value={w.maxBalls} />
    </label>
  </div>

  <div class="divider text-xs">受控球操作手感</div>
  <div class="grid grid-cols-2 gap-2">
    <label class="form-control">
      <span class="label-text text-xs">最大速度 (R/s)</span>
      <input type="number" class="input input-xs input-bordered" min="0" max="50" step="0.5" bind:value={w.ballSpeed} />
    </label>
    <label class="form-control">
      <span class="label-text text-xs">水平加速度 (R/s²)</span>
      <input type="number" class="input input-xs input-bordered" min="0" max="400" step="1" bind:value={w.ballAccel} />
    </label>
    <label class="form-control">
      <span class="label-text text-xs">减速度 (R/s²)</span>
      <input type="number" class="input input-xs input-bordered" min="0" max="200" step="1" bind:value={w.ballDecel} />
    </label>
    <label class="form-control">
      <span class="label-text text-xs">起跳速度 (R/s)</span>
      <input type="number" class="input input-xs input-bordered" min="0" max="50" step="0.5" bind:value={w.jumpVel} />
    </label>
    <label class="form-control">
      <span class="label-text text-xs">固定物理步长 (ms)</span>
      <input type="number" class="input input-xs input-bordered" min="8" max="33" step="1" bind:value={w.fixedStepMs} />
    </label>
  </div>

  <label class="flex items-center gap-2 text-sm">
    <input type="checkbox" class="checkbox checkbox-xs" bind:checked={w.enableSleeping} />
    启用物理休眠 (sleeping)
  </label>

  <div class="flex gap-1 pt-1">
    <button class="btn btn-xs btn-ghost" onclick={() => Object.assign(scene, resetScene())}>重置为默认场景</button>
  </div>
</div>
