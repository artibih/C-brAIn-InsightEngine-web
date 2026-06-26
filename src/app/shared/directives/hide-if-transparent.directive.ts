import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';



















@Directive({
  selector: 'img[hideIfTransparent]',
  standalone: true,
})
export class HideIfTransparentDirective implements AfterViewInit {
  private readonly el = inject(ElementRef<HTMLImageElement>);

  ngAfterViewInit(): void {
    const img = this.el.nativeElement;

    if (img.complete && img.naturalWidth > 0) {
      this.checkTransparency();
    } else {
      img.addEventListener(
        'load',
        () => this.checkTransparency(),
        { once: true },
      );
    }
  }

  private checkTransparency(): void {
    const img = this.el.nativeElement;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w === 0 || h === 0) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);

      
      
      const { data } = ctx.getImageData(0, 0, w, h);

      
      
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return; 
      }

      
      const parent = img.parentElement;
      if (parent) {
        parent.style.display = 'none';
      }
    } catch {
      
      
    }
  }
}
