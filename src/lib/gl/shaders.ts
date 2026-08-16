/**
 * GLSL ES 1.0 shader sources.
 *
 * Coordinate convention (matches the old canvas math):
 *  - "ball local" coords: origin at the ball CENTER, +y down, units = base radius R.
 *  - Screen space: device pixels, y down; NDC conversion happens in the vertex shader.
 *  - The body quad covers the ball mask bbox (padded by the stroke ring margin).
 *  - The flag sample uses the pre-squash local coords so the Gaussian distortion
 *    matches the CPU version exactly; squash/stretch lives purely in the vertex
 *    transform (area-preserving non-uniform scale pinned at the bottom contact).
 */

export const BALL_VS = `
attribute vec2 aLocal;   // ball-local coords (units of R, origin = ball center)
attribute vec2 aUV;      // ring-texture UV
uniform vec2 uViewport;  // device px
uniform vec2 uBallBottom; // device px, contact point (ballX, ballY + R)
uniform vec2 uScale;      // (squashW * ballScale, squashH * ballScale)
uniform float uR;         // base radius in device px
varying vec2 vLocal;
varying vec2 vUV;
void main() {
  vLocal = aLocal;
  vUV = aUV;
  // Pin the ball bottom to uBallBottom: pre-scale space has its origin there.
  vec2 pre = (aLocal - vec2(0.0, 1.0)) * uR;
  vec2 world = uBallBottom + uScale * pre;
  vec2 ndc = vec2(world.x / uViewport.x * 2.0 - 1.0,
                  1.0 - world.y / uViewport.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const BALL_FS = `
precision highp float;
varying vec2 vLocal;
varying vec2 vUV;
uniform sampler2D uMask;  // binary ball mask (ALPHA)
uniform sampler2D uRing;  // stroke ring (ALPHA)
uniform sampler2D uFlag;  // tiled flag texture (RGBA, premultiplied)
uniform vec2 uMaskSizePx;
uniform vec2 uRingSizePx;
uniform float uMarginPx;
uniform vec2 uSampling;   // (scx, scy) sampling center in flag px
uniform vec2 uFlagSize;   // (sW, sH) tiled flag texture size in px
uniform float uRNorm;     // mask bbox half-diagonal in px (distortion normalizer)
uniform float uFit;       // flag sampling fit multiplier
uniform vec3 uGauss;      // (amp, sigma, distort)
uniform vec2 uShadowRC;   // (hh, rc) moon shadow clip circle, in R units
uniform float uShadowStrength;
uniform float uR;         // base radius in device px (distortion normalizer)
uniform float uSampleR;   // nominal radius the flag tile was built at (FLAG_NOMINAL_R)

void main() {
  vec2 maskUV = (vUV * uRingSizePx - vec2(uMarginPx)) / uMaskSizePx;
  float m = texture2D(uMask, maskUV).a;
  vec4 col = vec4(0.0);

  if (m >= 0.5) {
    // Gaussian-distorted flag sampling (identical math to the CPU PoC).
    // The sampling SPAN is normalized to the nominal tile radius so the same
    // proportional part of the flag is visible on balls of any size; the
    // distortion normalizer uses the actual ball radius.
    vec2 v = vLocal * uR;                       // device-px offset from ball center
    float d = length(v);
    float u = d / uRNorm;
    float kG = 1.0 - uGauss.x * exp(-u * u / (uGauss.y * uGauss.y));
    float k = 1.0 + (kG - 1.0) * uGauss.z;
    vec2 sp = uSampling.xy + vLocal * uSampleR * k * uFit;
    col = texture2D(uFlag, sp / uFlagSize);

    // Bottom moon shadow: below the lower arc of the clip circle, gradient
    // from 0 at y = -hh to full strength at the ball bottom (y = R).
    float hh = uShadowRC.x;
    float rc = uShadowRC.y;
    float lx = vLocal.x;
    float ly = vLocal.y;
    float sh = 0.0;
    if (ly >= -hh) {
      if (abs(lx) <= rc) {
        float yEdge = -hh + sqrt(rc * rc - lx * lx);
        sh = ly >= yEdge ? 1.0 : 0.0;
      } else {
        sh = 1.0;
      }
    }
    float tShadow = clamp((ly + hh) / (1.0 + hh), 0.0, 1.0);
    col.rgb = mix(col.rgb, vec3(0.0), sh * uShadowStrength * tShadow);
  }

  // Stroke ring (precomputed chamfer ring, centered on the mask boundary).
  float ring = texture2D(uRing, vUV).a;
  col.rgb = mix(col.rgb, vec3(0.0), ring);
  col.a = max(col.a, ring);
  gl_FragColor = col;
}
`;

/** Masked quad (eyes): local rotation around a pivot, then the ball transform. */
export const MASKED_VS = `
attribute vec2 aLocal;  // ball-local coords rel. eye center (R units)
attribute vec2 aUV;     // ring-texture UV
uniform vec2 uViewport;
uniform vec2 uBallBottom;
uniform vec2 uScale;
uniform float uR;
uniform vec2 uPivot;    // rotation pivot in ball-local R units
uniform vec2 uCosSin;   // (cos, sin) of the aim rotation
uniform vec2 uOffset;   // per-eye offset in the rotated frame (R units)
varying vec2 vUV;
void main() {
  vUV = aUV;
  vec2 r = vec2(uCosSin.x * (aLocal.x + uOffset.x) - uCosSin.y * (aLocal.y + uOffset.y),
                uCosSin.y * (aLocal.x + uOffset.x) + uCosSin.x * (aLocal.y + uOffset.y));
  vec2 p = uPivot + r;
  vec2 pre = (p - vec2(0.0, 1.0)) * uR;
  vec2 world = uBallBottom + uScale * pre;
  vec2 ndc = vec2(world.x / uViewport.x * 2.0 - 1.0,
                  1.0 - world.y / uViewport.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const MASKED_FS = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uMask;
uniform sampler2D uRing;
uniform vec2 uMaskSizePx;
uniform vec2 uRingSizePx;
uniform float uMarginPx;
uniform vec3 uFillColor;   // premultiplied-safe RGB (white = (1,1,1))
uniform vec3 uStrokeColor;
void main() {
  vec2 maskUV = (vUV * uRingSizePx - vec2(uMarginPx)) / uMaskSizePx;
  float m = texture2D(uMask, maskUV).a;
  float ring = texture2D(uRing, vUV).a;
  vec3 rgb = uFillColor * m;
  rgb = mix(rgb, uStrokeColor, ring);
  float a = max(m, ring);
  gl_FragColor = vec4(rgb * a, a);
}
`;

/** Elliptical radial ground shadow. */
export const SHADOW_VS = `
attribute vec2 aUnit;    // quad corners in [-1, 1]
uniform vec2 uViewport;
uniform vec2 uCenter;    // device px
uniform vec2 uRadii;     // device px
varying vec2 vPos;
void main() {
  vPos = uCenter + aUnit * uRadii;
  vec2 ndc = vec2(vPos.x / uViewport.x * 2.0 - 1.0,
                  1.0 - vPos.y / uViewport.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const SHADOW_FS = `
precision highp float;
varying vec2 vPos;
uniform vec2 uCenter;
uniform vec2 uRadii;
uniform float uStrength;
void main() {
  vec2 n = (vPos - uCenter) / uRadii;
  float d2 = dot(n, n);
  if (d2 >= 1.0) discard;
  float t = 1.0 - d2;
  gl_FragColor = vec4(0.0, 0.0, 0.0, uStrength * t * t);
}
`;
