import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { FilesService } from '../../services/files.service';

@Directive({
  selector: 'img[signedSrc]',
  standalone: true,
})
export class SignedSrcDirective implements OnChanges, OnDestroy {
  private readonly filesService = inject(FilesService);
  private readonly el = inject(ElementRef<HTMLImageElement>);
  private sub?: Subscription;

  @Input('signedSrc') url: string = '';

  ngOnChanges(): void {
    this.sub?.unsubscribe();

    if (!this.url) {
      this.el.nativeElement.removeAttribute('src');
      return;
    }

    this.sub = this.filesService.resolveUrl(this.url).subscribe((resolved) => {
      this.el.nativeElement.src = resolved;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
