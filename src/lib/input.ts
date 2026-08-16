/** Keyboard + mouse input state (view-independent, CSS pixels). */
export interface Click {
  x: number;
  y: number;
}

export class Input {
  left = false;
  right = false;
  mouseX = 0;
  mouseY = 0;

  private spaceQueued = false;
  private clicks: Click[] = [];
  private listeners: Array<() => void> = [];

  /** True while the user is typing into a form control (ignore game keys). */
  private typing(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.typing()) return;
    if (e.code === 'KeyA') this.left = true;
    else if (e.code === 'KeyD') this.right = true;
    else if (e.code === 'Space') {
      e.preventDefault();
      this.spaceQueued = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'KeyA') this.left = false;
    else if (e.code === 'KeyD') this.right = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private onClick = (e: MouseEvent): void => {
    this.clicks.push({ x: e.clientX, y: e.clientY });
  };

  /** Attach to the window; returns a detach function. */
  attach(): () => void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('click', this.onClick);
    return () => {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('click', this.onClick);
    };
  }

  /** Edge-triggered jump. */
  consumeSpace(): boolean {
    const v = this.spaceQueued;
    this.spaceQueued = false;
    return v;
  }

  /** Edge-triggered spawn clicks. */
  consumeClicks(): Click[] {
    const c = this.clicks;
    this.clicks = [];
    return c;
  }
}
