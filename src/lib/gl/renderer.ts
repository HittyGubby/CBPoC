import { Program } from './program';
import { FlagCache } from './texture';
import { BALL_VS, BALL_FS, MASKED_VS, MASKED_FS, SHADOW_VS, SHADOW_FS } from './shaders';
import type { Polandball } from '../ball/polandball';

/** Ground-shadow state computed per ball each frame. */
export interface GroundShadowState {
  center: { x: number; y: number };
  radii: { x: number; y: number };
  strength: number;
  visible: boolean;
}

/**
 * Renderer — owns the GL context, the shader programs, the flag texture cache
 * and the shared unit quad. Draws a scene of Polandball instances with
 * z-sorting (painter's order by ball center y) and per-ball ground shadows.
 */
export class Renderer {
  readonly gl: WebGLRenderingContext;
  readonly flags: FlagCache;
  readonly ballProgram: Program;
  readonly maskedProgram: Program;
  readonly shadowProgram: Program;
  private readonly unitQuad: WebGLBuffer;

  private vw = 1;
  private vh = 1;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.flags = new FlagCache(gl);
    this.ballProgram = new Program(gl, BALL_VS, BALL_FS);
    this.maskedProgram = new Program(gl, MASKED_VS, MASKED_FS);
    this.shadowProgram = new Program(gl, SHADOW_VS, SHADOW_FS);

    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.unitQuad = quad;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha pipeline
  }

  resize(w: number, h: number): void {
    this.vw = Math.max(1, w);
    this.vh = Math.max(1, h);
    this.gl.viewport(0, 0, this.vw, this.vh);
  }

  /** Set the canvas clear (background) color, e.g. '#ffffff'. */
  setBackground(color: string): void {
    const { r, g, b, a } = parseHexColor(color);
    this.gl.clearColor(r, g, b, a);
  }

  clear(): void {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  /**
   * Draw all balls: ground shadows first, then bodies back-to-front.
   * Balls whose ids are in `onTop` (e.g. being dragged) are drawn last.
   */
  draw(balls: Polandball[], onTop?: Set<string>): void {
    this.clear();
    const sorted = balls
      .filter((b) => b.ready)
      .sort((a, b) => (onTop && onTop.has(a.id) !== onTop.has(b.id) ? (onTop.has(a.id) ? 1 : -1) : a.y - b.y));
    for (const b of sorted) this.drawGroundShadow(b.shadow);
    for (const b of sorted) b.render(this);
  }

  /** Prepare a buffer + attribute for interleaved [x, y, u, v] quad data. */
  makeQuadVbo(data: Float32Array): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return buf;
  }

  /** Bind an interleaved quad VBO with attrib layout (loc0 = 2 floats, loc1 = 2 floats). */
  bindQuadVbo(buf: WebGLBuffer, attrib0: number, attrib1: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(attrib0);
    gl.vertexAttribPointer(attrib0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(attrib1);
    gl.vertexAttribPointer(attrib1, 2, gl.FLOAT, false, 16, 8);
  }

  /** Bind the shared unit quad (2 floats, no UV). */
  bindUnitQuad(attrib: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitQuad);
    gl.enableVertexAttribArray(attrib);
    gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0);
  }

  get viewport(): { w: number; h: number } {
    return { w: this.vw, h: this.vh };
  }

  private drawGroundShadow(s: GroundShadowState): void {
    if (!s.visible) return;
    const gl = this.gl;
    const p = this.shadowProgram;
    p.use();
    gl.uniform2f(p.uniform('uViewport'), this.vw, this.vh);
    gl.uniform2f(p.uniform('uCenter'), s.center.x, s.center.y);
    gl.uniform2f(p.uniform('uRadii'), s.radii.x, s.radii.y);
    gl.uniform1f(p.uniform('uStrength'), s.strength);
    this.bindUnitQuad(p.attrib('aUnit'));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** Parse '#rgb', '#rgba', '#rrggbb', '#rrggbbaa' into 0..1 float components. */
function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h) && !/^[0-9a-fA-F]{8}$/.test(h)) h = 'ffffff';
  const num = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
    a,
  };
}
