<script lang="ts">
  import { COUNTRIES, findCountry } from '../data/countries';
  import { ballRadiusFraction, resolveBallFlag, type SceneState } from '../types';
  import ParamOverrides from './ParamOverrides.svelte';

  let { scene }: { scene: SceneState } = $props();
  const def = $derived(scene.balls.find((b) => b.id === scene.selectedBallId) ?? null);

  const countryInfo = $derived(def ? findCountry(def.country) : undefined);
  const sizeFrac = $derived(def ? ballRadiusFraction(def, scene.world) : 0);

  function onFlagFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !def) return;
    const reader = new FileReader();
    reader.onload = () => {
      def.flag = String(reader.result);
    };
    reader.readAsDataURL(file);
    input.value = '';
  }
</script>

{#if def}
  <div class="card bg-base-200 rounded-box p-3 space-y-3">
    <div class="flex items-center gap-2">
      {#if resolveBallFlag(def)}
        <img src={resolveBallFlag(def)} alt="" class="w-10 h-6 object-cover border border-base-300 rounded" />
      {/if}
      <div class="flex-1">
        <input class="input input-sm input-bordered w-full" bind:value={def.name} placeholder="显示名称" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="form-control">
        <span class="label-text text-xs">国家（自动旗 + 大小）</span>
        <select
          class="select select-xs select-bordered"
          value={def.country ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            def.country = v === '' ? null : v;
            if (def.country && !def.flag) def.name = findCountry(def.country)?.name ?? def.name;
          }}
        >
          <option value="">自定义 / 无国家</option>
          {#each COUNTRIES as c (c.code)}
            <option value={c.code}>{c.name}</option>
          {/each}
        </select>
      </label>
      <label class="form-control">
        <span class="label-text text-xs">自定义旗帜上传</span>
        <div class="flex gap-1">
          <input type="file" accept="image/*,.svg" class="file-input file-input-xs file-input-bordered flex-1" onchange={onFlagFile} />
          {#if def.flag}
            <button class="btn btn-xs btn-ghost" onclick={() => (def.flag = null)} title="恢复为国家旗">清除</button>
          {/if}
        </div>
      </label>
    </div>

    <div class="flex items-center gap-2">
      <span class="label-text text-xs">尺寸模式</span>
      <div class="join">
        <button class:btn-active={def.sizeMode === 'country'} class="btn btn-xs join-item" onclick={() => (def.sizeMode = 'country')}>国家面积推断</button>
        <button class:btn-active={def.sizeMode === 'manual'} class="btn btn-xs join-item" onclick={() => (def.sizeMode = 'manual')}>手动指定</button>
      </div>
    </div>

    {#if def.sizeMode === 'country'}
      <p class="text-xs opacity-70">
        {#if countryInfo}
          {countryInfo.name}：{countryInfo.areaKm2.toLocaleString()} km² → 屏幕占比 ≈ {(sizeFrac * 100).toFixed(1)}%
        {:else}
          未选择国家，使用手动大小
        {/if}
      </p>
    {:else}
      <label class="form-control">
        <span class="label-text text-xs">半径占屏比例: {(def.radiusFraction * 100).toFixed(1)}%</span>
        <input type="range" min="0.02" max="0.5" step="0.005" class="range range-xs" bind:value={def.radiusFraction} />
      </label>
    {/if}

    <details class="collapse collapse-arrow bg-base-100 rounded-box" open>
      <summary class="collapse-title text-sm font-medium">参数覆盖（默认不显示）</summary>
      <div class="collapse-content">
        <ParamOverrides {def} />
      </div>
    </details>
  </div>
{:else}
  <p class="text-xs opacity-60 p-3">选择一个球体进行编辑</p>
{/if}
