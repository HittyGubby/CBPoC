import type { PolandballConfig } from './config';

export type ParamValue = number | boolean | string;

export interface ParamMeta {
  key: Exclude<keyof PolandballConfig, 'flag'>;
  label: string;
  type: 'number' | 'boolean' | 'string';
  min?: number;
  max?: number;
  step?: number;
  /** Unit suffix for number inputs. */
  unit?: string;
  hint?: string;
}

/**
 * Editable per-ball parameters (flag is a dedicated top-level field).
 * Labels are user-facing; keys are the PolandballConfig field names.
 */
export const PARAM_META: ParamMeta[] = [
  // ---- flag sampling ----
  { key: 'flagFit', label: '旗帜拟合倍率', type: 'number', step: 0.1, hint: '采样半径放大倍率；0 = 自动按切点计算' },
  { key: 'flagRepeat', label: '旗帜平铺次数', type: 'number', min: 1, max: 9, step: 1 },
  { key: 'flagXOffset', label: '旗帜横向偏移', type: 'number', step: 0.05, hint: '占旗帜宽度比例，正 = 向右' },

  // ---- distortion ----
  { key: 'distort', label: '畸变强度', type: 'number', min: 0, max: 1, step: 0.05 },
  { key: 'gaussSigma', label: '畸变峰宽 σ', type: 'number', min: 0.2, max: 5, step: 0.1, hint: '越小越尖锐' },
  { key: 'gaussAmp', label: '畸变峰幅值', type: 'number', min: 0, max: 2.5, step: 0.05 },

  // ---- outline & stroke ----
  { key: 'ballPath', label: '球轮廓 SVG path', type: 'string' },
  { key: 'ballStroke', label: '轮廓描边粗细', type: 'number', min: 0, max: 0.3, step: 0.01, unit: '×R' },

  // ---- eyes ----
  { key: 'eyePathL', label: '左眼轮廓 SVG path', type: 'string' },
  { key: 'eyePathR', label: '右眼轮廓 SVG path', type: 'string', hint: '留空 = 镜像左眼' },
  { key: 'eyeStroke', label: '眼睛描边粗细', type: 'number', min: 0, max: 0.2, step: 0.005, unit: '×R' },
  { key: 'eyeScale', label: '眼睛尺寸', type: 'number', min: 0.1, max: 1, step: 0.05, unit: '×R' },
  { key: 'eyeDx', label: '双眼水平间距', type: 'number', min: 0, max: 1, step: 0.05, unit: '×R' },
  { key: 'eyeDy', label: '眼睛静止上移', type: 'number', min: -0.5, max: 0.5, step: 0.01, unit: '×R' },
  { key: 'eyeAim', label: '眼睛瞄准鼠标', type: 'boolean' },
  { key: 'eyeTrackR', label: '眼球追踪半径', type: 'number', min: 0.05, max: 0.8, step: 0.05, unit: '×R' },

  // ---- shadows ----
  { key: 'ballShadowStrength', label: '球底阴影强度', type: 'number', min: 0, max: 1, step: 0.05 },
  { key: 'ballShadowHeight', label: '阴影 clip 圆高度', type: 'number', min: 0, max: 3, step: 0.05, unit: '×R' },
  { key: 'ballShadowRadius', label: '阴影 clip 圆半径', type: 'number', min: 0.5, max: 4, step: 0.1, unit: '×R' },
  { key: 'groundShadowStrength', label: '地面阴影强度', type: 'number', min: 0, max: 1, step: 0.05 },
  { key: 'groundShadowRx', label: '地面阴影水平半径', type: 'number', min: 0.2, max: 3, step: 0.05, unit: '×R' },
  { key: 'groundShadowRy', label: '地面阴影垂直半径', type: 'number', min: 0.05, max: 1, step: 0.01, unit: '×R' },
  { key: 'groundShadowY', label: '地面阴影垂直偏移', type: 'number', min: -1, max: 1, step: 0.05, unit: '×R' },
  { key: 'groundShadowFadeout', label: '地面阴影衰减高度', type: 'number', min: 0.1, max: 5, step: 0.1, unit: '×R' },

  // ---- squash & stretch ----
  { key: 'squashHorizAmp', label: '走路正弦振幅', type: 'number', min: 0, max: 0.3, step: 0.005 },
  { key: 'squashHorizLambda', label: '走路正弦波长', type: 'number', min: 0.5, max: 10, step: 0.5 },
  { key: 'squashVertEps', label: '竖直加速度系数', type: 'number', min: 0, max: 0.01, step: 0.0001 },
  { key: 'squashAccelWindow', label: '竖直加速度窗口', type: 'number', min: 1, max: 30, step: 1, unit: '帧' },
  { key: 'growBounceAmp', label: '成长/缩小弹跳振幅', type: 'number', min: 0, max: 0.3, step: 0.005 },
  { key: 'growBounceLambda', label: '成长/缩小弹跳角速度', type: 'number', min: 1, max: 40, step: 1, unit: 'rad/s' },

  // ---- physics body ----
  { key: 'density', label: '密度', type: 'number', min: 0.0001, max: 0.1, step: 0.0001 },
  { key: 'friction', label: '滑动摩擦', type: 'number', min: 0, max: 1, step: 0.01 },
  { key: 'frictionStatic', label: '静摩擦', type: 'number', min: 0, max: 1, step: 0.01 },
  { key: 'restitution', label: '弹性 (bounce)', type: 'number', min: 0, max: 1, step: 0.05 },

  // ---- country-ball convenience (derived fields, not direct params) ----
  // (kept intentionally out of the picker: country, flag, sizeMode, radiusFraction)
];

const byKey = new Map(PARAM_META.map((m) => [m.key, m]));
export function paramMeta(key: string): ParamMeta | undefined {
  return byKey.get(key as ParamMeta['key']);
}

/** Order-stable list of all editable parameter keys (for the picker). */
export function allParamKeys(): (keyof PolandballConfig)[] {
  return PARAM_META.map((m) => m.key);
}
