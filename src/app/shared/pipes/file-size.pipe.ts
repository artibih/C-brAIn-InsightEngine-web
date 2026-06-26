import { Pipe, PipeTransform } from '@angular/core';






@Pipe({
  name: 'fileSize',
  standalone: true
})
export class FileSizePipe implements PipeTransform {
  private units = ['B', 'KB', 'MB', 'GB', 'TB'];

  transform(bytes: number | null | undefined, decimals: number = 1): string {
    if (bytes === null || bytes === undefined || bytes === 0) {
      return '0 B';
    }

    if (bytes < 0) {
      return 'Invalid size';
    }

    const k = 1024;
    const dm = Math.max(0, decimals);
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const index = Math.min(i, this.units.length - 1);

    return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${this.units[index]}`;
  }
}
