import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, SecurityContext } from '@angular/core';

import { DomSanitizer, SafeHtml } from '@angular/platform-browser';











@Component({
    selector: 'app-formatted-message',
    imports: [],
    templateUrl: './formatted-message.component.html',
    styleUrls: ['./formatted-message.component.scss']
})
export class FormattedMessageComponent implements OnChanges {
  @Input() content: string = '';
  @Input() isStreaming: boolean = false;
  @Input() responseId: string = '';
  @Input() canAccessReferences: boolean = true;
  @Output() citationClick = new EventEmitter<number>();

  formattedContent: SafeHtml = '';

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['content'] || changes['canAccessReferences']) {
      this.formattedContent = this.formatMarkdown(this.content);
    }
  }

  private formatMarkdown(text: string): SafeHtml {
    if (!text) return '';

    let html = text;

    html = html.replace(/\r\n?/g, '\n');

    html = this.escapeHtmlOutsideCode(html);

    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const language = lang || 'plaintext';
      const escapedCode = this.escapeHtml(code.trim());
      return `<div class="code-block">
        <div class="code-block__header">
          <span class="code-block__lang">${language}</span>
          <button class="code-block__copy" onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.textContent)">
            <i class="bi bi-clipboard"></i> Copy
          </button>
        </div>
        <pre class="code-block__content"><code class="language-${language}">${escapedCode}</code></pre>
      </div>`;
    });

    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
      return `<div class="latex-block">${this.escapeHtml(formula.trim())}</div>`;
    });

    html = html.replace(/\$([^$\n]+)\$/g, (_, formula) => {
      return `<span class="latex-inline">${this.escapeHtml(formula)}</span>`;
    });

    html = this.processTable(html);

    html = html.replace(/^### (.+)$/gm, '<h4 class="msg-h4">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="msg-h3">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="msg-h2">$1</h2>');

    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');

    html = html.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    html = html.replace(/\[([\d]+(?:\s*,\s*\d+)*)\]/g, (_, inner) => {
      const nums = inner.split(',').map((s: string) => s.trim()).filter((s: string) => s);
      return nums.map((num: string) => {
        if (!this.canAccessReferences) {
          return `<span class="citation-link citation-link--locked" title="Access restricted"><span class="citation-link__number">${num}</span><i class="bi bi-lock" style="font-size:8px;margin-left:2px"></i></span>`;
        }
        return `<a class="citation-link" href="#" data-citation="${num}" title="View source ${num}" role="button"><span class="citation-link__number">${num}</span><svg class="citation-link__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="10" height="10"><path d="M6 10L10 6M10 6H6.5M10 6V9.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="2" y="2" width="12" height="12" rx="2" stroke-linecap="round"/></svg></a>`;
      }).join('');
    });

    html = html.replace(/^(\s*[-•*]\s+.+(?:\n|$))+/gm, (match) => {
      const items = match.trim().split('\n').map(line => {
        const text = line.replace(/^\s*[-•*]\s+/, '');
        return `<li>${text}</li>`;
      }).join('');
      return `<ul class="msg-list">${items}</ul>`;
    });

    html = html.replace(/^(\s*\d+\.\s+.+(?:\n|$))+/gm, (match) => {
      const items = match.trim().split('\n').map(line => {
        const text = line.replace(/^\s*\d+\.\s+/, '');
        return `<li>${text}</li>`;
      }).join('');
      return `<ol class="msg-list">${items}</ol>`;
    });

    html = html.replace(
      /(?<!")(?<!')\b(https?:\/\/[^\s<)}\]]+)/g,
      (_, url) => {
        const isDoi = url.includes('doi.org/');
        const isPubmed = url.includes('pubmed.ncbi.nlm.nih.gov/');
        if ((isDoi || isPubmed) && !this.canAccessReferences) {
          return `<span class="msg-link msg-link--locked" title="Access restricted"><i class="bi bi-lock"></i> ${url}</span>`;
        }
        return `<a class="msg-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      }
    );

    html = html.replace(/\n(?!<\/?(div|ul|ol|table|h[234]|pre))/g, '<br>');

    html = html.replace(/(<br>\s*){3,}/g, '<br><br>');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeHtmlOutsideCode(text: string): string {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) return part;
      return part
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }).join('');
  }

  private processTable(html: string): string {
    html = this.parseStandardTables(html);

    html = this.parseFlatTables(html);

    html = this.parsePipeTables(html);

    return html;
  }

  private parseStandardTables(html: string): string {
    const tableRegex = /\|(.+)\|\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/g;

    return html.replace(tableRegex, (match, headerRow, separatorRow, bodyRows) => {
      const colCount = (separatorRow.match(/-{3,}/g) || []).length;
      if (colCount < 2) return match;

      let headers = this.splitTableCells(headerRow);
      if (headers.length > colCount) headers = headers.slice(headers.length - colCount);
      while (headers.length < colCount) headers.push('');

      const rows = this.parseBodyRows(bodyRows.trim(), colCount);
      if (rows.length === 0) return match;

      return this.buildTableHtml(headers, rows);
    });
  }

  private parseFlatTables(html: string): string {
    const sepRegex = /\|(?:\s*[-:]{3,}\s*\|){2,}/;
    let iterations = 0;

    while (sepRegex.test(html) && iterations < 5) {
      iterations++;
      const result = this.extractFlatTable(html);
      if (!result) break;
      html = result;
    }

    return html;
  }

  private extractFlatTable(text: string): string | null {
    const sepMatch = text.match(/\|(?:\s*[-:]{3,}\s*\|){2,}/);
    if (!sepMatch || sepMatch.index === undefined) return null;

    const separator = sepMatch[0];
    const colCount = (separator.match(/-{3,}/g) || []).length;
    if (colCount < 2) return null;

    const pipesPerRow = colCount + 1;
    const sepStart = sepMatch.index;
    const sepEnd = sepStart + separator.length;

    const before = text.substring(0, sepStart).replace(/\n/g, ' ');
    const after = text.substring(sepEnd).replace(/\n/g, ' ');

    const headerStr = this.extractLastPipeRow(before, pipesPerRow);
    if (!headerStr) return null;

    const headerStart = before.lastIndexOf(headerStr);
    const proseText = before.substring(0, headerStart).trim();
    const { rows: bodyStrs, endIndex } = this.extractPipeRows(after, pipesPerRow);
    if (bodyStrs.length === 0) return null;

    const remainderText = after.substring(endIndex).trim();

    let headers = this.splitTableCells(headerStr);
    if (headers.length > colCount) headers = headers.slice(headers.length - colCount);
    while (headers.length < colCount) headers.push('');

    const rows = bodyStrs.map(r => {
      const cells = this.splitTableCells(r);
      while (cells.length < colCount) cells.push('');
      return cells.slice(0, colCount);
    });

    const tableHtml = this.buildTableHtml(headers, rows);

    const parts: string[] = [];
    if (proseText) parts.push(proseText);
    parts.push(tableHtml);
    if (remainderText) parts.push(remainderText);

    return parts.join('\n');
  }

  private parseBodyRows(bodyText: string, colCount: number): string[][] {
    const rows: string[][] = [];

    for (const line of bodyText.split('\n')) {
      const cells = this.splitTableCells(line);
      if (cells.length <= colCount) {
        while (cells.length < colCount) cells.push('');
        rows.push(cells);
      } else {

        for (const rowStr of this.splitByPipeCount(line, colCount + 1)) {
          const rowCells = this.splitTableCells(rowStr);
          while (rowCells.length < colCount) rowCells.push('');
          rows.push(rowCells.slice(0, colCount));
        }
      }
    }

    return rows;
  }

  private buildTableHtml(headers: string[], rows: string[][]): string {
    const thHtml = headers.map(h => `<th>${h || '&nbsp;'}</th>`).join('');
    const tbHtml = rows.map(row =>
      `<tr>${row.map(c => `<td>${c || '&nbsp;'}</td>`).join('')}</tr>`
    ).join('');

    return `<div class="table-wrapper"><table class="msg-table"><thead><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table></div>`;
  }

  private extractLastPipeRow(text: string, pipesPerRow: number): string | null {
    const trimmed = text.trimEnd();
    let pipeCount = 0;

    for (let i = trimmed.length - 1; i >= 0; i--) {
      if (trimmed[i] === '|') {
        pipeCount++;
        if (pipeCount === pipesPerRow) {
          return trimmed.substring(i);
        }
      }
    }
    return null;
  }

  private extractPipeRows(text: string, pipesPerRow: number): { rows: string[]; endIndex: number } {
    const rows: string[] = [];
    let pipeCount = 0;
    let rowStart = -1;
    let lastEnd = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '|') {
        if (rowStart === -1) rowStart = i;
        pipeCount++;
        if (pipeCount === pipesPerRow) {
          rows.push(text.substring(rowStart, i + 1).trim());
          lastEnd = i + 1;
          pipeCount = 0;
          rowStart = -1;
        }
      } else if (rowStart === -1 && text[i] !== ' ' && text[i] !== '\t' && text[i] !== '\n') {
        break;
      }
    }

    return { rows, endIndex: lastEnd };
  }

  private splitByPipeCount(text: string, pipesPerRow: number): string[] {
    const rows: string[] = [];
    let pipeCount = 0;
    let rowStart = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '|') {
        pipeCount++;
        if (pipeCount === pipesPerRow) {
          rows.push(text.substring(rowStart, i + 1).trim());
          pipeCount = 0;
          rowStart = i + 1;
        }
      }
    }

    const remaining = text.substring(rowStart).trim();
    if (remaining && remaining.includes('|')) rows.push(remaining);

    return rows;
  }

  private parsePipeTables(html: string): string {
    const lines = html.split('\n');
    const result: string[] = [];
    let buffer: string[] = [];

    const hasPipes = (line: string): boolean => {
      const t = line.trim();
      if (t.startsWith('<div') || t.startsWith('<table')) return false;
      return (t.match(/\|/g) || []).length >= 3;
    };

    const flush = () => {
      if (buffer.length >= 2) {
        result.push(this.buildPipeTableFromLines(buffer));
      } else if (buffer.length === 1) {
        result.push(this.parseSingleLinePipeTable(buffer[0]));
      }
      buffer = [];
    };

    for (const line of lines) {
      if (hasPipes(line)) {
        buffer.push(line);
      } else {
        flush();
        result.push(line);
      }
    }
    flush();

    return result.join('\n');
  }

  private buildPipeTableFromLines(lines: string[]): string {
    const dataLines = lines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()));
    if (dataLines.length < 2) return lines.join('\n');

    const rows = dataLines.map(l => this.splitTableCells(l));
    const colCount = Math.max(...rows.map(r => r.length));

    const padded = rows.map(r => {
      while (r.length < colCount) r.push('');
      return r.slice(0, colCount);
    });

    return this.buildTableHtml(padded[0], padded.slice(1));
  }

  private parseSingleLinePipeTable(line: string): string {
    const totalPipes = (line.match(/\|/g) || []).length;
    if (totalPipes < 6) return line;

    const firstPipe = line.indexOf('|');
    const lastPipe = line.lastIndexOf('|');
    if (firstPipe === lastPipe) return line;

    const pipeRegion = line.substring(firstPipe, lastPipe + 1);

    let bestCols = -1;
    let bestScore = -1;

    for (let cols = 2; cols <= Math.min(15, totalPipes - 1); cols++) {
      const rows = this.splitByPipeCount(pipeRegion, cols + 1);
      if (rows.length < 2) continue;

      const firstRowCells = this.splitTableCells(rows[0]);
      const nonEmpty = firstRowCells.filter(c => c.length > 0).length;
      const headerQuality = nonEmpty / cols;

      const score = headerQuality >= 1 ? rows.length * 100 : rows.length * headerQuality;
      if (score > bestScore) {
        bestScore = score;
        bestCols = cols;
      }
    }

    if (bestCols < 2) return line;

    const rows = this.splitByPipeCount(pipeRegion, bestCols + 1);
    const allRows = rows.map(r => {
      const cells = this.splitTableCells(r);
      while (cells.length < bestCols) cells.push('');
      return cells.slice(0, bestCols);
    });

    const pre = line.substring(0, firstPipe).trim();
    const post = line.substring(lastPipe + 1).trim();
    const tableHtml = this.buildTableHtml(allRows[0], allRows.slice(1));

    const parts: string[] = [];
    if (pre) parts.push(pre);
    parts.push(tableHtml);
    if (post) parts.push(post);
    return parts.join('\n');
  }

  private splitTableCells(row: string): string[] {
    const cells = row.split('|');
    if (cells.length > 0 && cells[0].trim() === '') cells.shift();
    if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(c => c.trim());
  }

  onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const link = target.closest('.citation-link') as HTMLElement | null;
    if (!link) return;

    event.preventDefault();
    event.stopPropagation();

    const citationNum = link.getAttribute('data-citation');
    if (citationNum) {
      const num = Number(citationNum);
      this.citationClick.emit(num);
      const rect = link.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('citationClick', {
        detail: {
          index: num,
          responseId: this.responseId,
          rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        }
      }));
    }
  }

  onCitationClicked(index: number): void {
    this.citationClick.emit(index);
  }
}
