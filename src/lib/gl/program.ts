/** Minimal WebGL1 program wrapper with cached attribute/uniform locations. */
export class Program {
  readonly gl: WebGLRenderingContext;
  readonly handle: WebGLProgram;
  readonly attribs: Record<string, number> = {};
  readonly uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string) {
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('program link failed: ' + log);
    }
    this.handle = prog;
  }

  use(): void {
    this.gl.useProgram(this.handle);
  }

  attrib(name: string): number {
    let loc = this.attribs[name];
    if (loc === undefined) {
      loc = this.gl.getAttribLocation(this.handle, name);
      this.attribs[name] = loc;
    }
    return loc;
  }

  uniform(name: string): WebGLUniformLocation | null {
    if (!(name in this.uniforms)) {
      this.uniforms[name] = this.gl.getUniformLocation(this.handle, name);
    }
    return this.uniforms[name];
  }

  /** Destroy the program (callers may rely on GC otherwise). */
  dispose(): void {
    this.gl.deleteProgram(this.handle);
  }
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(
      (type === gl.VERTEX_SHADER ? 'vertex' : 'fragment') + ' shader compile failed: ' + log + '\n---\n' + src,
    );
  }
  return sh;
}
