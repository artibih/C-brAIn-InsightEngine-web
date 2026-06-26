import {
  Directive,
  ElementRef,
  Input,
} from '@angular/core';

@Directive({
  selector: '[typingAnimation]',
  standalone: true
})
export class TypingAnimationDirective {
  private _content = '';
  private current = '';
  private queue = '';
  private running = false;
  private textNode: Text | null = null;

  constructor(private el: ElementRef<HTMLElement>) {}

  @Input('typingAnimation')
  set content(val: string) {
    this._content = val || '';
    this.queue = this._content.slice(this.current.length);
    if (!this.running) this.doAnimate();
  }

  @Input()
  set isTyping(val: boolean) {
    if (val) {
      this.current = '';
      this.el.nativeElement.textContent = '';
      const doc = this.el.nativeElement.ownerDocument || document;
      this.textNode = doc.createTextNode('');
      this.el.nativeElement.appendChild(this.textNode);
      this.queue = this._content;
      if (!this.running) this.doAnimate();
    } else {
      this.queue = '';
      this.current = this._content;
      this.el.nativeElement.textContent = this.current;
      this.textNode = null;
    }
  }

  private async doAnimate() {
    this.running = true;
    while (this.queue.length) {
      const nextChar = this.queue[0];
      this.current += nextChar;
      if (this.textNode) {
        this.textNode.appendData(nextChar);
      } else {
        this.el.nativeElement.textContent = this.current;
      }
      this.queue = this.queue.slice(1);
      await new Promise(r => setTimeout(
        r,
        /[.,!?]/.test(this.current.slice(-1)) ? 20 : 6
      ));
    }
    this.running = false;
  }
}
