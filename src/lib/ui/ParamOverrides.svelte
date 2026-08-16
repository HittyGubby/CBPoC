<script lang="ts">
  import { createDefaultConfig, type PolandballConfig } from '../config';
  import { allParamKeys, paramMeta, type ParamMeta } from '../paramMeta';
  import type { BallDef } from '../types';

  let { def }: { def: BallDef } = $props();

  const defaults = createDefaultConfig();

  const available = $derived(allParamKeys().filter((k) => !(k in def.params)));

  function defaultValue(meta: ParamMeta): number | boolean | string {
    return (defaults as unknown as Record<string, unknown>)[meta.key] as number | boolean | string;
  }

  /** Adding a param happens immediately on selection (default value, editable). */
  function onPick(event: Event): void {
    const sel = event.currentTarget as HTMLSelectElement;
    const key = sel.value;
    sel.value = '';
    if (!key) return;
    const meta = paramMeta(key);
    if (!meta) return;
    (def.params as Record<string, unknown>)[meta.key] = defaultValue(meta);
  }

  function removeParam(key: string): void {
    delete (def.params as Record<string, unknown>)[key];
  }
</script>

<div class="space-y-1">
  <select class="select select-xs select-bordered w-full" onchange={onPick} aria-label="添加参数">
    <option value="">添加参数…（选中即添加）</option>
    {#each available as key (key)}
      <option value={key}>{paramMeta(key)?.label ?? key}</option>
    {/each}
  </select>
  {#if available.length === 0}
    <p class="text-xs opacity-60">已添加全部参数</p>
  {/if}
  {#each Object.entries(def.params) as [key, value] (key)}
    {@const meta = paramMeta(key)}
    {#if meta}
      <div class="flex items-center gap-1">
        <label class="label text-xs w-32 shrink-0" title={meta.hint ?? key}>{meta.label}</label>
        {#if meta.type === 'boolean'}
          <input
            class="checkbox checkbox-xs"
            type="checkbox"
            checked={Boolean(value)}
            onchange={(e) => ((def.params as Record<string, unknown>)[key] = (e.currentTarget as HTMLInputElement).checked)}
          />
        {:else if meta.type === 'number'}
          <input
            class="input input-xs input-bordered flex-1"
            type="number"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={Number(value)}
            oninput={(e) => ((def.params as Record<string, unknown>)[key] = Number((e.currentTarget as HTMLInputElement).value))}
          />
        {:else}
          <input
            class="input input-xs input-bordered flex-1"
            type="text"
            value={String(value)}
            oninput={(e) => ((def.params as Record<string, unknown>)[key] = (e.currentTarget as HTMLInputElement).value)}
          />
        {/if}
        <button class="btn btn-xs btn-ghost" onclick={() => removeParam(key)} title="移除参数">移除</button>
      </div>
    {/if}
  {/each}
</div>
