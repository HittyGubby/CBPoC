<script lang="ts">
  import { onMount } from 'svelte';

  // 指数（高斯）畸变强度：0 = 不畸变，1 = 完整高斯峰畸变
  const DISTORT = 0.4;
  // 畸变峰形状：三维正态分布峰 exp(-(u/σ)²)，u 以遮罩最小包围矩形归一化
  const GAUSS_SIGMA = 1.5; // 峰宽（u 单位，越小越尖锐）
  const GAUSS_AMP = 1.4; // 峰幅值（中心最大放大倍率对应 1/(1-AMP)）
  // 旗子拟合倍率：中心被放大(det>1)会让旗子超出遮罩、周边内容被裁掉。
  // 通过放大采样半径把旗子“缩小”，使畸变后旗子边缘恰好与遮罩边缘相切。
  // 0 = 自动按切点计算；>0 = 手动指定（>1 表示旗子显得更小）。
  const FLAG_FIT = 2.3;
  // 旗子水平平铺次数：采样源横向重复多少次旗子，防止视角/畸变采样越界。
  // 无论重复多少次，都以中间的 tile 为中心（如 3 次时以第 2 个 tile 为中心）。
  const FLAG_REPEAT = 3;
  // 旗子横向偏移：占旗子宽度的比例，用于把侧边细节显示到球心（正 = 向右偏移采样）
  const FLAG_X_OFFSET = -0.2;
  // 本地默认旗子：使用相对 base 路径，兼容 GitHub Pages 子路径部署（如 /CBPoC/）。
  // 用本地资源避免线上图缺 CORS 导致画布被污染/加载失败；?flag=<url> 仍可覆盖（png/svg/jpg 及线上链接）。
  const FLAG_PATH = import.meta.env.BASE_URL + 'flag-usa.svg';
  const DEFAULT_FLAG = FLAG_PATH;
  // 球轮廓描边粗细，占球半径的比例（0 = 不描边）
  const BALL_STROKE = 0.08;

  // 眼睛：提供左右轮廓 path 与描边粗细；内部填充纯白色（不采样旗子纹理/遮罩）。
  // 某一侧为空时镜像另一侧；两侧都提供则分别按原样绘制。
  // EYE_PATH_L / EYE_PATH_R：左/右眼闭合轮廓（相对坐标，会按 EYE_SCALE 缩放）。
  const EYE_PATH_L =
    'm 250.44413,36.609859 c 0,2.7447 -0.4966,5.81482 -2.10985,7.727873 -1.88287,2.232785 -5.12079,3.090418 -8.32499,3.090417 -3.52077,-10e-7 -7.3709,-1.085393 -9.33664,-3.696712 -1.35606,-1.801404 -1.74965,-4.596865 -1.58076,-7.073322 0.40473,-5.934341 4.96784,-10.770032 10.9174,-10.770033 2.86304,-1e-6 5.26664,0.439965 7.32221,2.117655 2.48945,2.031815 3.11263,5.518343 3.11263,8.604122 z';
  const EYE_PATH_R = ''; // 空 -> 镜像左眼
  const EYE_STROKE = 0.05; // 描边粗细，占球半径的比例
  const EYE_SCALE = 0.50; // 眼睛尺寸，占球半径的比例（取轮廓最大边）
  const EYE_DX = 0.40; // 双眼水平间距，占球半径（静止位各偏左/偏右）
  const EYE_DY = 0.14; // 眼睛静止时的上移，占球半径
  // 眼睛倾斜瞄准鼠标：true = 每只眼睛绕自身中心旋转到朝向鼠标（相对球心）；false = 不旋转
  const EYE_AIM = true;
  // 眼球追踪（两段映射，单位 = 球半径，y 向上为正）：
  //  r（EYE_TRACK_R）为追踪圆半径。
  //  1) 矩形视图按极坐标映射到以球心为圆心、半径 r 的圆：
  //     角度不变，半径按该角度射线到矩形边框的距离比例缩放（ρ = r·d/L）。
  //  2) 再按纵向半轴映射到以 (0,EYE_DY) 为圆心、半径 r 的圆作为眼睛位置：
  //     (0,r)->(0,r)、(0,-r)->(0,-r)、(0,EYE_DY)->(0,0)，中间线性插值；x 全等映射。
  const EYE_TRACK_R = 0.35;

  // 球移动/物理（速度以球半径为单位：实际设备像素速度 = 常量 × 球半径）
  const BALL_SPEED = 6; // 左右最大移动速度（球半径/秒）
  const BALL_ACCEL = 42; // 水平加速度（球半径/秒²）
  const BALL_DECEL = 20; // 松手减速度（球半径/秒²）
  const GRAVITY = 26; // 重力加速度（球半径/秒²）
  const JUMP_VEL = 9; // 起跳初速度（球半径/秒，向上）
  const SCALE_SPEED = 0.5; // 缩放速率（每秒相对增长率；w/s 按住时指数增长/缩小）

  // 阴影参数（长度以球半径为单位）
  const BALL_SHADOW_STRENGTH = 0.3; // 球底部阴影强度（0-1；0 = 关闭）
  const BALL_SHADOW_HEIGHT = 1.16; // 阴影 clip 圆中心离球心的高度（占球半径，正值 = 向上）
  const BALL_SHADOW_RADIUS = 2.0; // 阴影 clip 圆半径（占球半径）
  const GROUND_SHADOW_STRENGTH = 0.5; // 地面阴影最大强度（落地时；0 = 关闭）
  const GROUND_SHADOW_RX = 1.15; // 地面阴影水平半径（占球半径）
  const GROUND_SHADOW_RY = 0.26; // 地面阴影垂直半径（占球半径）
  const GROUND_SHADOW_Y = 0.0; // 地面阴影中心相对地面线的垂直偏移（占球半径，正 = 向下）
  const GROUND_SHADOW_FADEOUT = 1.5; // 离地高度衰减：高度达该值（球半径）时强度减半

  // 运动压扁拉伸（面积不变，h·w=1；最终 h 会 clamp 到安全范围）
  const SQUASH_HORIZ_AMP = 0.05; // 走路正弦振幅 A
  const SQUASH_HORIZ_LAMBDA = 3; // 走路正弦波长 lambda（每移动 1 球半径对应的弧度）
  const SQUASH_VERT_EPS = 0.001; // 竖直加速度调节系数 epsilon
  const SQUASH_ACCEL_WINDOW = 6; // 竖直加速度滑动窗口帧数
  // 原地成长/缩小时的呼吸/走路正弦：振幅与角速度都更大，让缩放过程呈现明显的正弦动画
  const GROW_BOUNCE_AMP = 0.1; // 成长/缩小正弦振幅
  const GROW_BOUNCE_LAMBDA = 16; // 成长/缩小正弦角速度（弧度/秒）

  // 球的形状：用户 Inkscape 画的半边轮廓 SVG path，左右镜像后得到完整球轮廓。
  const BALL_PATH =
    'm 136.82324,139.99302 c 27.52313,-0.43053 32.50123,-8.88223 36.34068,-17.60727 6.5267,-14.83176 4.24206,-48.332114 -22.6679,-57.861248 -3.62627,-1.284104 -9.06937,-1.698415 -13.67202,-1.688355';

  // 用浏览器原生 SVG 采样路径上的点（支持任意 M/L/C/S/Q/T/A 命令）
  function sampleHalfPath(d: string, n = 400): { x: number; y: number }[] {
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'path');
    el.setAttribute('d', d);
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    const len = el.getTotalLength();
    const pts: { x: number; y: number }[] = [];
    if (len > 0) {
      for (let k = 0; k <= n; k++) {
        const p = el.getPointAtLength((len * k) / n);
        pts.push({ x: p.x, y: p.y });
      }
    }
    el.remove();
    return pts;
  }

  // 半边轮廓 + 水平镜像 = 完整闭合球轮廓。
  // 沿起终点 x 中点的竖直线镜像（不旋转），使两半在起终点相接。
  function buildOutline(d: string): { x: number; y: number }[] {
    const half = sampleHalfPath(d);
    if (half.length < 2) return [];
    const axis = (half[0].x + half[half.length - 1].x) / 2;
    const mir = half.slice().reverse().map((p) => ({ x: 2 * axis - p.x, y: p.y }));
    return half.concat(mir);
  }

  let canvasEl: HTMLCanvasElement;
  let flag: HTMLImageElement | null = null;
  // 鼠标位置（CSS 视口坐标），范围 0..vw / 0..vh
  let mouseX = 0;
  let mouseY = 0;

  // 原样水平平铺国旗 FLAG_REPEAT 次（不镜像），防止水平视角变化时采样溢出
  function buildTiledSource(flag: HTMLImageElement, fw: number, fh: number): HTMLCanvasElement {
    const tile = document.createElement('canvas');
    tile.width = fw;
    tile.height = fh;
    const tctx = tile.getContext('2d')!;
    tctx.drawImage(flag, 0, 0, fw, fh);

    const canvas = document.createElement('canvas');
    canvas.width = fw * FLAG_REPEAT;
    canvas.height = fh;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    for (let col = 0; col < FLAG_REPEAT; col++) {
      ctx.drawImage(tile, col * fw, 0);
    }
    return canvas;
  }

  const sample = (
    data: Uint8ClampedArray,
    sw: number,
    sh: number,
    x: number,
    y: number,
  ): [number, number, number, number] => {
    x = Math.max(0, Math.min(sw - 1.001, x));
    y = Math.max(0, Math.min(sh - 1.001, y));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, sw - 1);
    const y1 = Math.min(y0 + 1, sh - 1);
    const fx = x - x0;
    const fy = y - y0;
    const i00 = (y0 * sw + x0) * 4;
    const i10 = (y0 * sw + x1) * 4;
    const i01 = (y1 * sw + x0) * 4;
    const i11 = (y1 * sw + x1) * 4;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    return [
      data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11,
      data[i00 + 1] * w00 + data[i10 + 1] * w10 + data[i01 + 1] * w01 + data[i11 + 1] * w11,
      data[i00 + 2] * w00 + data[i10 + 2] * w10 + data[i01 + 2] * w01 + data[i11 + 2] * w11,
      data[i00 + 3] * w00 + data[i10 + 3] * w10 + data[i01 + 3] * w01 + data[i11 + 3] * w11,
    ];
  };

  onMount(() => {
    const ctx = canvasEl.getContext('2d')!;

    let view = { W: 0, H: 0, r: 0 };
    // 球心位置（设备像素）与垂直速度；默认落在下边缘
    let ballX = 0;
    let ballY = 0;
    let ballVx = 0;
    let ballVy = 0;
    let ballScale = 1; // 缩放（w/s）：模拟靠近/远离；所有尺寸/速度协变
    let onGround = true;
    // 压扁拉伸系数（宽度、高度，面积不变）
    let squashW = 1;
    let squashH = 1;
    let walkPhase = 0;
    let prevVy = 0;
    const accelBuf: number[] = [];
    let ballCv: HTMLCanvasElement | null = null;
    let ballImg: ImageData | null = null;
    let src: { data: Uint8ClampedArray; sW: number; sH: number; fw: number; fh: number } | null = null;
    let raf = 0;

    // 球轮廓（路径单位）与逐尺寸生成的遮罩/描边（均相对球心，便于随球移动）
    const outline = buildOutline(BALL_PATH);
    let mask: Uint8Array | null = null;
    let maskRel = { x0rel: 0, y0rel: 0, w: 0, h: 0 };
    let strokeRel: Path2D | null = null;
    // 眼睛（左右各一）。EYE_PATH_L / EYE_PATH_R 分别为左右眼轮廓；
    // 某一侧为空则镜像另一侧，两侧都提供时分别按原样绘制。
    const mirrorX = (pts: { x: number; y: number }[]) => {
      if (!pts.length) return pts;
      let minX = Infinity, maxX = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
      const c = (minX + maxX) / 2;
      return pts.map((p) => ({ x: 2 * c - p.x, y: p.y }));
    };

    const rawL = EYE_PATH_L ? sampleHalfPath(EYE_PATH_L, 120) : [];
    const rawR = EYE_PATH_R ? sampleHalfPath(EYE_PATH_R, 120) : [];
    const outlineL = rawL.length ? rawL : mirrorX(rawR);
    const outlineR = rawR.length ? rawR : mirrorX(rawL);
    let eyePaths: (Path2D | null)[] = [];

    // 眼睛轮廓路径：以局部原点（眼睛中心）为坐标，缩放为 EYE_SCALE·r（CSS 坐标）。
    // 绘制时再通过 translate 平移到眼睛中心（含追踪映射）。
    const buildEyePath = (outline: { x: number; y: number }[]): Path2D | null => {
      if (!outline.length) return null;
      const { r } = view;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let ex0 = Infinity, ex1 = -Infinity, ey0 = Infinity, ey1 = -Infinity;
      for (const p of outline) {
        if (p.x < ex0) ex0 = p.x;
        if (p.x > ex1) ex1 = p.x;
        if (p.y < ey0) ey0 = p.y;
        if (p.y > ey1) ey1 = p.y;
      }
      const eyeSize = Math.max(ex1 - ex0, ey1 - ey0);
      if (eyeSize === 0) return null;
      const s = (EYE_SCALE * r) / eyeSize;
      const ecx = (ex0 + ex1) / 2;
      const ecy = (ey0 + ey1) / 2;
      const p = new Path2D();
      for (let i = 0; i < outline.length; i++) {
        const q = outline[i];
        const xx = ((q.x - ecx) * s) / dpr;
        const yy = ((q.y - ecy) * s) / dpr;
        if (i === 0) p.moveTo(xx, yy);
        else p.lineTo(xx, yy);
      }
      p.closePath();
      return p;
    };

    const buildEyes = () => {
      eyePaths = [buildEyePath(outlineL), buildEyePath(outlineR)];
    };

    const buildShape = () => {
      mask = null;
      strokeRel = null;
      if (!outline.length) return;
      const { r } = view;
      const cx = ballX;
      const cy = ballY;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of outline) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const scale = (2 * r) / Math.max(maxX - minX, maxY - minY);
      const ox = (minX + maxX) / 2;
      const oy = (minY + maxY) / 2;
      const dev = outline.map((p) => ({
        x: (p.x - ox) * scale + cx,
        y: (p.y - oy) * scale + cy,
      }));

      let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      for (const p of dev) {
        if (p.x < bx0) bx0 = p.x;
        if (p.x > bx1) bx1 = p.x;
        if (p.y < by0) by0 = p.y;
        if (p.y > by1) by1 = p.y;
      }
      bx0 = Math.floor(bx0);
      bx1 = Math.ceil(bx1);
      by0 = Math.floor(by0);
      by1 = Math.ceil(by1);
      const mw = bx1 - bx0 + 1;
      const mh = by1 - by0 + 1;

      const mc = document.createElement('canvas');
      mc.width = mw;
      mc.height = mh;
      const mctx = mc.getContext('2d')!;
      const mp = new Path2D();
      for (let i = 0; i < dev.length; i++) {
        const q = dev[i];
        if (i === 0) mp.moveTo(q.x - bx0, q.y - by0);
        else mp.lineTo(q.x - bx0, q.y - by0);
      }
      mp.closePath();
      mctx.fillStyle = '#fff';
      mctx.fill(mp);
      const md = mctx.getImageData(0, 0, mw, mh).data;
      const m = new Uint8Array(mw * mh);
      for (let i = 0; i < mw * mh; i++) m[i] = md[i * 4] > 127 ? 1 : 0;
      mask = m;
      maskRel = { x0rel: bx0 - cx, y0rel: by0 - cy, w: mw, h: mh };

      // 离屏球画布：每帧渲染旗子，再按压扁拉伸比例画到主画布
      const bcv = document.createElement('canvas');
      bcv.width = mw;
      bcv.height = mh;
      ballCv = bcv;
      ballImg = bcv.getContext('2d')!.createImageData(mw, mh);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sp = new Path2D();
      for (let i = 0; i < dev.length; i++) {
        const q = dev[i];
        if (i === 0) sp.moveTo((q.x - cx) / dpr, (q.y - cy) / dpr);
        else sp.lineTo((q.x - cx) / dpr, (q.y - cy) / dpr);
      }
      sp.closePath();
      strokeRel = sp;
      buildEyes();
    };

    const computeView = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(window.innerWidth * dpr);
      const H = Math.round(window.innerHeight * dpr);
      if (W === view.W && H === view.H) return;
      const r = Math.min(W, H) * 0.2;
      view = { W, H, r };
      // 球落在下边缘（中心 = 下边 - 球半径）
      ballX = W / 2;
      ballY = H - r;
      ballVx = 0;
      ballVy = 0;
      ballScale = 1;
      onGround = true;
      canvasEl.width = W;
      canvasEl.height = H;
      buildShape();
    };

    const buildSrc = () => {
      if (!flag) return;
      try {
        const { r } = view;
        const scale = (r * 2) / Math.min(flag.naturalWidth, flag.naturalHeight);
        const fw = Math.round(flag.naturalWidth * scale);
        const fh = Math.round(flag.naturalHeight * scale);
        const cv = buildTiledSource(flag, fw, fh);
        src = {
          data: cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data,
          sW: cv.width,
          sH: cv.height,
          fw,
          fh,
        };
      } catch {
        // 跨域图片导致画布被污染，无法读取像素：回退本地 SVG
        if (flag.src !== FLAG_PATH) {
          flag = null;
          const fb = new Image();
          fb.src = FLAG_PATH;
          fb.onload = () => {
            flag = fb;
            buildSrc();
          };
        }
      }
    };

    const draw = () => {
      if (!flag || !src || !mask) return;
      const { W, H } = view;
      const { data: srcData, sW, sH, fw, fh } = src;
      const { x0rel, y0rel, w: mw, h: mh } = maskRel;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      // 当前球心（设备像素）与遮罩包围盒（随球移动）
      const cx = ballX;
      const cy = ballY;
      const x0 = cx + x0rel;
      const y0 = cy + y0rel;

      // 眼球追踪（极坐标两段映射，y 向上为正，单位 = 球半径）。
      // 参考点 = 球心（屏幕坐标），使球始终对准鼠标。
      // 1) 鼠标极坐标映射到以球心为圆心、半径 EYE_TRACK_R 的圆：角度不变，
      //    半径 ρ = EYE_TRACK_R·d/L（L = 该角度射线从球心到视口矩形边框的距离）。
      // 2) 纵向半轴映射到以 (0,EYE_DY) 为圆心、半径 EYE_TRACK_R 的圆作为眼睛位置。
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 视觉球心：缩放围绕底部，视觉中心随缩放上移/下移（用于瞄准参考）
      const cyVis = ballY + view.r * (1 - ballScale);
      const refX = cx / dpr;
      const refY = cyVis / dpr;
      const dx = mouseX - refX;
      const dy = -(mouseY - refY); // y 向上为正
      const d = Math.hypot(dx, dy);
      let cosA = 0;
      let sinA = 1;
      let cosS = 0;
      let sinS = 0;
      if (d > 1e-3) {
        cosA = dx / d;
        sinA = dy / d;
        cosS = dx / d;
        sinS = -(dy / d); // 屏幕方向（y 向下）用于求边框距离
      }
      // 从球心沿屏幕方向到窗口边框的距离
      let L = Infinity;
      if (cosS > 0) L = Math.min(L, (vw - refX) / cosS);
      else if (cosS < 0) L = Math.min(L, (0 - refX) / cosS);
      if (sinS > 0) L = Math.min(L, (vh - refY) / sinS);
      else if (sinS < 0) L = Math.min(L, (0 - refY) / sinS);
      const rho = d > 1e-3 ? Math.min(EYE_TRACK_R, EYE_TRACK_R * (d / L)) : 0;
      const xd = rho * cosA;
      const yd = rho * sinA;
      // 纵向半轴线性映射（源圆中心 (0,EYE_DY) -> 目的圆心 (0,0) 反向得到眼睛位置）
      const ye =
        yd >= 0
          ? EYE_DY + (EYE_TRACK_R - EYE_DY) * (yd / EYE_TRACK_R)
          : EYE_DY + (EYE_TRACK_R + EYE_DY) * (yd / EYE_TRACK_R);
      const xe = xd; // x 轴全等映射

      // 国旗水平移动：与眼睛同步（水平分量 xe），叠加可调的横向偏移。
      const centerTile = Math.floor(FLAG_REPEAT / 2);
      const scx = (centerTile + 0.5) * fw - xe * view.r + FLAG_X_OFFSET * fw;
      const scy = sH / 2;

      // 指数（高斯）畸变：distortion 幅值 = 三维正态分布峰 AMP·exp(-(u/σ)²)，
      // u 以遮罩最小包围矩形（半对角线）归一化，覆盖整个矩形——不再以内切圆 r 截断，
      // 因此超出圆形部分的自定义路径同样会被畸变。
      const out = ctx.createImageData(W, H);
      const outData = out.data;
      const rNorm = Math.sqrt(mw * mw + mh * mh) / 2;
      const invSigma2 = 1 / (GAUSS_SIGMA * GAUSS_SIGMA);
      // 拟合倍率：把采样半径放大到切点处 k=1，使畸变后的旗子边缘与遮罩边缘相切。
      const flagEdgeU = Math.min(mw, mh) / Math.sqrt(mw * mw + mh * mh);
      const kEdge = 1 + ((1 - GAUSS_AMP * Math.exp(-(flagEdgeU * flagEdgeU) * invSigma2)) - 1) * DISTORT;
      const fit = FLAG_FIT > 0 ? FLAG_FIT : 1 / kEdge;
      // 像素坐标必须为整数（球移动后坐标变浮点会导致写入静默失败）
      const ix0 = Math.round(x0);
      const iy0 = Math.round(y0);
      // 旗子渲染到离屏球画布（尺寸 = 遮罩包围盒），便于压扁拉伸整体变换
      if (!ballCv || !ballImg) return;
      const bctx = ballCv.getContext('2d')!;
      const bimg = ballImg;
      const bd = bimg.data;
      for (let j = 0; j < mh; j++) {
        const py = iy0 + j;
        const vy = py - cy;
        const vy2 = vy * vy;
        const rowOff = j * mw;
        for (let i = 0; i < mw; i++) {
          if (!mask[rowOff + i]) continue;
          const px = ix0 + i;
          const vx = px - cx;
          const d2 = vx * vx + vy2;
          const u = Math.sqrt(d2) / rNorm;
          const kGauss = 1 - GAUSS_AMP * Math.exp(-(u * u) * invSigma2);
          const k = 1 + (kGauss - 1) * DISTORT;
          const [cr, cg, cb, ca] = sample(srcData, sW, sH, scx + vx * k * fit, scy + vy * k * fit);
          const oi = (j * mw + i) * 4;
          bd[oi] = cr;
          bd[oi + 1] = cg;
          bd[oi + 2] = cb;
          bd[oi + 3] = ca;
        }
      }
      bctx.putImageData(bimg, 0, 0);

      // 地面阴影：固定在地面线（不随球升降），强度反比于离地高度（feather 边缘）。尺寸协变缩放。
      if (GROUND_SHADOW_STRENGTH > 0) {
        const re = view.r * ballScale; // 有效半径
        const groundY = H; // 地面线（画布底边）
        const height = Math.max(0, groundY - view.r - ballY); // 球离地高度
        const strength = GROUND_SHADOW_STRENGTH / (1 + height / (GROUND_SHADOW_FADEOUT * re));
        if (strength > 0.01) {
          const gsx = ballX;
          const gsy = groundY + GROUND_SHADOW_Y * re;
          const grx = GROUND_SHADOW_RX * re;
          const gry = GROUND_SHADOW_RY * re;
          const sx0 = Math.max(0, Math.floor(gsx - grx));
          const sx1 = Math.min(W - 1, Math.ceil(gsx + grx));
          const sy0 = Math.max(0, Math.floor(gsy - gry));
          const sy1 = Math.min(H - 1, Math.ceil(gsy + gry));
          const ivrx = 1 / grx;
          const ivry = 1 / gry;
          for (let py = sy0; py <= sy1; py++) {
            const ndy = (py - gsy) * ivry;
            const ndy2 = ndy * ndy;
            const mj = py - iy0;
            const oi0 = py * W;
            for (let px = sx0; px <= sx1; px++) {
              const mi = px - ix0;
              if (mj >= 0 && mj < mh && mi >= 0 && mi < mw && mask[mj * mw + mi]) continue;
              const ndx = (px - gsx) * ivrx;
              const d2 = ndx * ndx + ndy2;
              if (d2 >= 1) continue;
              const t = 1 - d2;
              const a = Math.round(strength * t * t * 255);
              if (a <= 0) continue;
              const oi = (oi0 + px) * 4;
              outData[oi] = 0;
              outData[oi + 1] = 0;
              outData[oi + 2] = 0;
              outData[oi + 3] = a;
            }
          }
        }
      }
      ctx.putImageData(out, 0, 0);

      // ---- 压扁拉伸渲染：以球底部中心为原点缩放 (squashW, squashH)，面积不变 ----
      const bcX = ballX;
      const bcY = ballY + view.r; // 底部中心（接触点）
      const Rc = view.r / dpr; // CSS 球半径
      const w = squashW;
      const h = squashH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.translate(bcX / dpr, bcY / dpr);
      ctx.scale(w * ballScale, h * ballScale);
      // 旗子（离屏画布），底部中心对齐
      ctx.drawImage(ballCv, -(bcX - ix0) / dpr, -(bcY - iy0) / dpr);
      // 移到旗子中心：此 translate 在缩放前的用户坐标系，会被 scale 缩放，
      // 因此固定平移基准半径 Rc，即可对准任意 scale/squash 下的旗子中心。
      ctx.translate(0, -Rc);

      // 球底部阴影：上边为 clip 圆的月牙弧、下边为矩形（覆盖球底延伸部分），加 feather
      if (strokeRel && BALL_SHADOW_STRENGTH > 0) {
        const hh = Rc * BALL_SHADOW_HEIGHT;
        const rc = Rc * BALL_SHADOW_RADIUS;
        ctx.save();
        ctx.clip(strokeRel);
        const m = Rc * 0.6; // 矩形向两侧/下方延伸量
        const p = new Path2D();
        p.arc(0, -hh, rc, 0, Math.PI, false); // clip 圆下弧（月牙上边）
        p.lineTo(-rc, Rc + m);
        p.lineTo(Rc + m, Rc + m);
        p.lineTo(Rc + m, -hh);
        p.closePath();
        const grad = ctx.createLinearGradient(0, -hh, 0, Rc);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${BALL_SHADOW_STRENGTH})`);
        ctx.fillStyle = grad;
        ctx.fill(p);
        ctx.restore();
      }

      // 描边：用户 SVG 轮廓（相对球心）
      if (strokeRel && BALL_STROKE > 0) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = BALL_STROKE * Rc;
        ctx.stroke(strokeRel);
      }

      // 眼睛：双眼作为整体绕其中点倾斜，角度映射到 ±对角线角内（不直接瞄准，避免跳变）
      if (eyePaths[0] || eyePaths[1]) {
        const pivotX = xe * Rc;
        const pivotY = -ye * Rc;
        // 折叠瞄准角：phi = 鼠标相对球心的方向；theta = MAX_TILT·sin(2φ)，
        // 始终在 ±屏幕对角线角内平滑往返，不会整圈旋转跳变。
        const MAX_TILT = Math.atan2(window.innerHeight, window.innerWidth);
        const aimAngle = EYE_AIM ? MAX_TILT * Math.sin(2 * Math.atan2(-dy, dx)) : 0;
        ctx.save();
        ctx.translate(pivotX, pivotY);
        if (EYE_AIM) ctx.rotate(aimAngle);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = EYE_STROKE * Rc;
        ctx.lineJoin = 'round';
        for (let i = 0; i < 2; i++) {
          const p = eyePaths[i];
          if (!p) continue;
          ctx.save();
          ctx.translate(i === 0 ? -EYE_DX * Rc : EYE_DX * Rc, 0);
          ctx.fill(p);
          ctx.stroke(p);
          ctx.restore();
        }
        ctx.restore();
      }
      ctx.restore();
    };

    // 物理更新：a/d 控制水平速度（加速/减速），space 起跳（初速度 + 重力），落地回到底部。
    const update = (dt: number) => {
      const { W, H, r } = view;
      if (r === 0) return;
      // 缩放：w 变大、s 变小（模拟靠近/远离）；协变到半径。
      // 乘除/指数式缩放：速度正比于当前 scale，w/s 按住时按比例连续增长/衰减。
      const growDir = (keys.grow ? 1 : 0) - (keys.shrink ? 1 : 0);
      if (growDir !== 0) ballScale *= Math.exp(growDir * SCALE_SPEED * dt);
      ballScale = Math.max(0.3, Math.min(3, ballScale));
      const re = r * ballScale; // 有效半径
      // 水平速度：目标速度由按键决定；落地才减速（空气中保持水平速度，不至于垂直下落）
      const maxV = BALL_SPEED * re;
      const target = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (target > 0) ballVx = Math.min(ballVx + BALL_ACCEL * re * dt, maxV);
      else if (target < 0) ballVx = Math.max(ballVx - BALL_ACCEL * re * dt, -maxV);
      else if (onGround && ballVx > 0) ballVx = Math.max(0, ballVx - BALL_DECEL * re * dt);
      else if (onGround) ballVx = Math.min(0, ballVx + BALL_DECEL * re * dt);
      ballX += ballVx * dt;
      // 重力
      ballVy += GRAVITY * re * dt;
      ballY += ballVy * dt;
      // 地面（渲染底部 = 球心 + 基准半径 view.r，因缩放围绕底部；落地时底部 = H）
      const groundY = H - r;
      if (ballY >= groundY) {
        ballY = groundY;
        ballVy = 0;
        onGround = true;
      } else {
        onGround = false;
      }
      // 水平限制在视口内（用有效半径）
      if (ballX < re) ballX = re;
      if (ballX > W - re) ballX = W - re;

      // ---- 压扁拉伸（面积不变） ----
      // 横向：走路正弦，h = 1 - A·sin(lambda·vx·t)，相位随移动距离累积。
      // 水平移动时按速度推进；原地成长/缩小时也以固定速率推进，从而产生明显的正弦弹跳。
      const moving = Math.abs(ballVx) > re * 0.01;
      if (moving || keys.grow || keys.shrink) {
        const speed = moving ? ballVx / re : keys.grow ? 1 : -1;
        walkPhase += (moving ? SQUASH_HORIZ_LAMBDA : GROW_BOUNCE_LAMBDA) * speed * dt;
      } else {
        walkPhase = 0;
      }
      const hHoriz = 1 - (moving ? SQUASH_HORIZ_AMP : GROW_BOUNCE_AMP) * Math.sin(walkPhase);
      // 竖直：加速度（速度变化率滑动窗口均值）。向上加速压扁、向下加速拉长。
      const instAy = dt > 0 ? (ballVy - prevVy) / dt / re : 0; // 有效半径/秒²，向上为负
      prevVy = ballVy;
      accelBuf.push(instAy);
      if (accelBuf.length > SQUASH_ACCEL_WINDOW) accelBuf.shift();
      let sumAy = 0;
      for (const a of accelBuf) sumAy += a;
      const ay = accelBuf.length ? sumAy / accelBuf.length : 0;
      const hVert = ay < 0 ? 1 - SQUASH_VERT_EPS * -ay : 1 + SQUASH_VERT_EPS * ay;
      // 叠加，并 clamp 到安全范围
      squashH = Math.max(0.55, Math.min(1.5, hHoriz + hVert - 1));
      squashW = 1 / squashH;
    };

    let lastNow = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };

    // 旗子来源：?flag=<url> 覆盖（支持 png/svg/jpg 及线上链接），默认线上图片；失败回退本地 SVG
    const params = new URLSearchParams(location.search);
    const loadFlag = (src: string) => {
      const im = new Image();
      if (src.startsWith('http') || src.startsWith('https') || src.startsWith('//')) {
        im.crossOrigin = 'anonymous'; // 跨域需 CORS，否则画布被污染
      }
      im.onload = () => {
        flag = im;
        computeView();
        buildSrc();
      };
      im.onerror = () => {
        if (src !== FLAG_PATH) loadFlag(FLAG_PATH);
      };
      im.src = src;
    };
    loadFlag(params.get('flag') || DEFAULT_FLAG);

    computeView();

    const keys = { left: false, right: false, grow: false, shrink: false };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyA') keys.left = true;
      else if (e.code === 'KeyD') keys.right = true;
      else if (e.code === 'KeyW') keys.grow = true;
      else if (e.code === 'KeyS') keys.shrink = true;
      else if (e.code === 'Space') {
        e.preventDefault();
        if (onGround) {
          ballVy = -JUMP_VEL * view.r * ballScale;
          onGround = false;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyA') keys.left = false;
      else if (e.code === 'KeyD') keys.right = false;
      else if (e.code === 'KeyW') keys.grow = false;
      else if (e.code === 'KeyS') keys.shrink = false;
    };
    window.addEventListener('resize', () => {
      computeView();
      buildSrc();
    });
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', () => {});
      window.removeEventListener('mousemove', () => {});
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });
</script>

<canvas bind:this={canvasEl}></canvas>
