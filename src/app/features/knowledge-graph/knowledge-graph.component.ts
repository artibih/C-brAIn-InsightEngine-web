import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import cytoscape, { Core, ElementDefinition, EventObject, LayoutOptions } from 'cytoscape';
import fcose from 'cytoscape-fcose';

import {
  GraphEdge,
  GraphNode,
  GraphSchema,
  GraphStats,
  PathsStreamEvent,
  SearchHit,
  SubgraphResponse,
} from '../../models/knowledge-graph.models';
import { KnowledgeGraphApiService } from '../../services/knowledge-graph-api.service';
import { FilesService } from '../../services/files.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  FCOSE_LAYOUT,
  GRAPH_PALETTE,
  buildStylesheet,
  colourForLabel,
} from './cytoscape-config';

type NodeWithView = GraphNode & {

  hiddenNeighbors?: number;
};

interface LabelCount {
  label: string;
  count: number;
  fill: string;
  text: string;
}

let fcoseRegistered = false;
if (!fcoseRegistered) {
  try {
    (cytoscape as unknown as { use: (ext: unknown) => void }).use(fcose);
    fcoseRegistered = true;
  } catch {
    fcoseRegistered = true;
  }
}

@Component({
  selector: 'app-knowledge-graph',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './knowledge-graph.component.html',
  styleUrls: ['./knowledge-graph.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KnowledgeGraphComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cyContainer', { static: true }) private cyContainer!: ElementRef<HTMLDivElement>;

  private readonly api = inject(KnowledgeGraphApiService);
  private readonly filesService = inject(FilesService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly resolvingPaperUrls = signal<Set<string>>(new Set());


  openPaperUrl(paperUrl: string): void {
    if (!paperUrl) return;

    if (!FilesService.isPrivateBlobUrl(paperUrl)) {
      const direct = window.open(paperUrl, '_blank', 'noopener,noreferrer');
      if (direct) direct.opener = null;
      return;
    }

    const inFlight = this.resolvingPaperUrls();
    if (inFlight.has(paperUrl)) return;

    const win = window.open('about:blank', '_blank');
    if (win) {
      try { (win as any).opener = null; } catch {  }
    }

    const next = new Set(inFlight);
    next.add(paperUrl);
    this.resolvingPaperUrls.set(next);

    this.filesService.getDownloadUrl(paperUrl).subscribe({
      next: (signedUrl) => {
        const after = new Set(this.resolvingPaperUrls());
        after.delete(paperUrl);
        this.resolvingPaperUrls.set(after);
        if (!signedUrl) {
          win?.close();
          this.toast.error('Open failed', 'Could not retrieve a download link for this paper.');
          return;
        }
        if (win && !win.closed) {
          win.location.replace(signedUrl);
        } else {
          window.open(signedUrl, '_blank', 'noopener,noreferrer');
        }
      },
      error: (err) => {
        const after = new Set(this.resolvingPaperUrls());
        after.delete(paperUrl);
        this.resolvingPaperUrls.set(after);
        win?.close();
        console.error('Paper download URL request failed', err);
        this.toast.error('Open failed', 'Could not retrieve a download link for this paper.');
      },
    });
  }

  readonly canAccessReferences = signal(false);

  readonly schema = signal<GraphSchema | null>(null);
  readonly stats = signal<GraphStats | null>(null);

  readonly searchQuery = signal('');
  readonly searchResults = signal<SearchHit[]>([]);
  readonly searchTotal = signal<number | null>(null);
  readonly searchFacets = signal<Record<string, number>>({});
  readonly showSearchPanel = signal(false);
  readonly searchLoading = signal(false);


  private static readonly SEARCH_PAGE_SIZE = 100;

  private static readonly SEARCH_OFFSET_MAX = 1000;

  readonly searchOffset = signal<number>(0);

  readonly hasMoreSearchResults = computed(() => {
    const total = this.searchTotal();
    if (total == null) return false;
    const loaded = this.searchResults().length;
    return (
      loaded < total &&
      loaded < KnowledgeGraphComponent.SEARCH_OFFSET_MAX + KnowledgeGraphComponent.SEARCH_PAGE_SIZE
    );
  });

  readonly searchCapReached = computed(() => {
    const total = this.searchTotal();
    if (total == null) return false;
    const loaded = this.searchResults().length;
    return (
      total > loaded &&
      this.searchOffset() >= KnowledgeGraphComponent.SEARCH_OFFSET_MAX
    );
  });

  readonly selectedNode = signal<GraphNode | null>(null);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly labelFilter = signal<Record<string, boolean>>({});


  readonly extraLabels = signal<string[]>([]);

  readonly allLabels = computed<string[]>(() => {
    const schemaLabels = this.schema()?.labels ?? [];
    const known = new Set(schemaLabels.map((l) => l.toLowerCase()));
    const extras = this.extraLabels().filter((l) => !known.has(l.toLowerCase()));
    return [...schemaLabels, ...extras];
  });

  readonly pathSource = signal<string | null>(null);
  readonly streamedPaths = signal<number>(0);

  readonly labelCounts = computed<LabelCount[]>(() => {
    const labels = this.allLabels();
    const counts = this.canvasCounts();

    const lookup = new Map<string, number>();
    for (const [k, v] of Object.entries(counts)) {
      lookup.set(k.toLowerCase(), (lookup.get(k.toLowerCase()) ?? 0) + v);
    }
    return labels
      .map((label) => {
        const palette = colourForLabel(label, labels);
        return {
          label,
          count: lookup.get(label.toLowerCase()) ?? 0,
          fill: palette.fill,
          text: palette.text,
        } satisfies LabelCount;
      })
      .filter((b) => b.count > 0);
  });

  private readonly canvasCounts = signal<Record<string, number>>({});

  private cy: Core | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private readonly expandedNodes = new Set<string>();


  private hasLaidOutOnce = false;


  private static readonly AUTO_EXPAND_MAX_DEGREE = 50;

  private readonly searchInput$ = new Subject<string>();
  private pathsStreamSub: Subscription | null = null;


  readonly searchFacetBadges = computed<LabelCount[]>(() => {
    const labels = this.allLabels();
    const facets = this.searchFacets();
    return Object.entries(facets)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => {
        const palette = colourForLabel(label, labels);
        return { label, count, fill: palette.fill, text: palette.text } satisfies LabelCount;
      });
  });

  readonly hasSelection = computed(() => this.selectedIds().size > 0);
  readonly canCompare = computed(() => this.selectedIds().size >= 2);

  get canvasNodeCount(): number {
    return this.cy?.nodes().length ?? 0;
  }

  get hasClearableState(): boolean {
    return (
      !!this.searchQuery() ||
      this.canvasNodeCount > 0 ||
      this.selectedNode() !== null ||
      this.selectedIds().size > 0
    );
  }

  constructor() {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => this.performSearch(q, 0));


    this.auth.canAccessReferences$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((can) => this.canAccessReferences.set(can));

    effect(() => {
      const schema = this.schema();
      if (!this.cy || !schema) return;
      this.cy.style(buildStylesheet({ labels: schema.labels }));
    });
  }



  ngOnInit(): void {
    this.api.getSchema().subscribe({
      next: (res) => {
        if (res?.success && res.data) {
          this.schema.set(res.data);
          const filter: Record<string, boolean> = {};
          res.data.labels.forEach((l) => (filter[l] = true));
          this.labelFilter.set(filter);
        }
      },
      error: (err) => this.handleError('schema', err),
    });

    this.api.getStats().subscribe({
      next: (res) => {
        if (res?.success && res.data) {
          this.stats.set(res.data);

          this.absorbLabels(Object.keys(res.data.nodes_by_label ?? {}));
        }
      },
      error: (err) => this.handleError('stats', err),
    });
  }

  ngAfterViewInit(): void {
    this.cy = cytoscape({
      container: this.cyContainer.nativeElement,
      elements: [],
      style: buildStylesheet({ labels: this.schema()?.labels ?? [] }),
      layout: { name: 'preset' },
      minZoom: 0.15,
      maxZoom: 3,
    });

    this.cy.on('tap', 'node', (e: EventObject) => this.onNodeTap(e));
    this.cy.on('dbltap', 'node', (e: EventObject) => this.onNodeDoubleTap(e));
    this.cy.on('tap', (e: EventObject) => {
      if (e.target === this.cy) {
        this.selectedNode.set(null);
        this.selectedIds.set(new Set());
      }
    });

    const host = this.cyContainer.nativeElement;
    this.cy.on('mouseover', 'node', () => (host.style.cursor = 'grab'));
    this.cy.on('mouseout', 'node', () => (host.style.cursor = ''));
    this.cy.on('grab', 'node', () => (host.style.cursor = 'grabbing'));
    this.cy.on('free', 'node', () => (host.style.cursor = 'grab'));

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.cy) return;
      this.cy.resize();
      if (this.cy.nodes().length > 0) this.cy.fit(undefined, 60);
    });
    this.resizeObserver.observe(this.cyContainer.nativeElement);
  }

  ngOnDestroy(): void {
    this.pathsStreamSub?.unsubscribe();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.cy?.destroy();
    this.cy = null;
  }


  close(): void {
    this.router.navigate(['/']);
  }


  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    if (value.trim().length === 0) {
      this.searchResults.set([]);
      this.searchTotal.set(null);
      this.searchFacets.set({});
      this.showSearchPanel.set(false);
      return;
    }

    this.searchOffset.set(0);
    this.searchResults.set([]);
    this.showSearchPanel.set(true);
    this.searchInput$.next(value);
  }

  openSearch(): void {
    this.showSearchPanel.set(true);
  }

  closeSearch(): void {
    this.showSearchPanel.set(false);
  }


  clearSearch(): void {

    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchTotal.set(null);
    this.searchFacets.set({});
    this.searchLoading.set(false);
    this.showSearchPanel.set(false);
    this.searchOffset.set(0);

    this.selectedNode.set(null);
    this.selectedIds.set(new Set());

    this.pathSource.set(null);
    this.streamedPaths.set(0);
    this.pathsStreamSub?.unsubscribe();
    this.pathsStreamSub = null;

    this.errorMessage.set(null);

    if (this.cy) {
      this.cy.elements().remove();
      this.canvasCounts.set({});
    }

    this.expandedNodes.clear();
    this.hasLaidOutOnce = false;
  }

  private performSearch(q: string, offset = 0): void {
    this.searchLoading.set(true);
    this.api
      .search(q, undefined, KnowledgeGraphComponent.SEARCH_PAGE_SIZE, offset)
      .subscribe({
        next: (res) => {
          this.searchLoading.set(false);
          if (!res?.success || !res.data) return;

          const incoming = res.data.results ?? [];

          if (offset === 0) {
            this.searchResults.set(incoming);
          } else {
            const existing = this.searchResults();
            const seen = new Set(existing.map((h) => h.id));
            const merged = existing.concat(incoming.filter((h) => !seen.has(h.id)));
            this.searchResults.set(merged);
          }

          this.searchTotal.set(res.data.total ?? this.searchResults().length);
          this.searchFacets.set(res.data.facets ?? {});
          this.searchOffset.set(offset + incoming.length);

          this.absorbLabels(incoming.map((h) => h.label));
        },
        error: (err) => {
          this.searchLoading.set(false);
          this.handleError('search', err);
        },
      });
  }
  loadMoreSearchResults(): void {
    if (!this.hasMoreSearchResults() || this.searchLoading()) return;
    const q = this.searchQuery().trim();
    if (!q) return;
    const nextOffset = Math.min(
      this.searchOffset(),
      KnowledgeGraphComponent.SEARCH_OFFSET_MAX,
    );
    this.performSearch(q, nextOffset);
  }

  onSearchResultClick(hit: SearchHit): void {
    this.closeSearch();
    this.loadInitialNode(hit.id);
  }



  private loadInitialNode(id: string): void {
    this.loading.set(true);

    this.expandedNodes.add(id);

    this.api.getNode(id).subscribe({
      next: (res) => res?.data && this.selectedNode.set(res.data),
      error: (err) => this.handleError('node', err),
    });

    this.api.getNeighbors(id, { depth: 1, limit: 50 }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res?.success && res.data) this.mergeSubgraph(res.data);
        this.focusNode(id);
      },
      error: (err) => {
        this.loading.set(false);
        this.handleError('neighbors', err);
      },
    });
  }

  expandNode(id: string, confirmHubs = true): void {
    const cy = this.cy;
    if (!cy) return;
    const node = cy.getElementById(id);
    if (node.empty()) return;

    const degree = (node.data('degree') as number | undefined) ?? 0;
    if (confirmHubs && degree > 100) {
      const proceed = window.confirm(
        `This node has ${degree} neighbours. Expanding may clutter the canvas. Continue?`
      );
      if (!proceed) return;
    }

    this.expandedNodes.add(id);
    this.loading.set(true);
    this.api.getNeighbors(id, { depth: 1, limit: 50 }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res?.success && res.data) {
          this.mergeSubgraph(res.data, { runLayout: true, sourceId: id });
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.handleError('expand', err);
      },
    });
  }

  compareSelected(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length < 2) return;

    this.loading.set(true);
    this.api.getSubgraph(ids, { depth: 2, limit: 300 }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res?.success && res.data) {
          this.replaceSubgraph(res.data);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.handleError('compare', err);
      },
    });
  }

  startPathFromSelected(): void {
    const current = this.selectedNode();
    if (!current) return;
    this.pathSource.set(current.id);
    this.errorMessage.set(`Pick any node to find paths from "${this.displayNameFor(current)}".`);
  }

  cancelPath(): void {
    this.pathSource.set(null);
    this.streamedPaths.set(0);
    this.errorMessage.set(null);
    this.pathsStreamSub?.unsubscribe();
    this.pathsStreamSub = null;
    this.cy?.elements().removeClass('dimmed highlighted');
  }

  private streamPathsTo(toId: string): void {
    const fromId = this.pathSource();
    if (!fromId || !this.cy) return;

    this.pathsStreamSub?.unsubscribe();
    this.streamedPaths.set(0);
    this.cy.elements().addClass('dimmed');

    this.pathsStreamSub = this.api.streamPaths(fromId, toId, 4, 20).subscribe({
      next: (evt: PathsStreamEvent) => {
        if (evt.kind === 'path') {
          this.streamedPaths.update((n) => n + 1);
          this.mergeSubgraph({ nodes: evt.path.nodes, edges: evt.path.edges });
          for (const n of evt.path.nodes) {
            this.cy!.getElementById(n.id).removeClass('dimmed').addClass('highlighted');
          }
          for (const e of evt.path.edges) {
            this.cy!.getElementById(e.id).removeClass('dimmed').addClass('highlighted');
          }
        } else if (evt.kind === 'done') {
          this.errorMessage.set(`Found ${evt.total} path(s).`);
        } else if (evt.kind === 'error') {
          this.errorMessage.set(evt.message);
        }
      },
      error: (err) => this.handleError('paths-stream', err),
      complete: () => {
        this.pathsStreamSub = null;
      },
    });
  }

  exportCanvas(): void {
    const cy = this.cy;
    if (!cy) return;
    const nodeIds = cy.nodes().map((n) => n.id());
    if (nodeIds.length === 0) return;

    this.api.export(nodeIds).subscribe({
      next: (res) => {
        if (res?.success && res.data) {
          this.triggerJsonDownload(res.data, 'knowledge-graph-export.json');
        }
      },
      error: (err) => this.handleError('export', err),
    });
  }

  private triggerJsonDownload(data: unknown, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }


  private onNodeTap(e: EventObject): void {
    const id = e.target.id() as string;


    if (this.pathSource() && this.pathSource() !== id) {
      this.streamPathsTo(id);
      return;
    }
    const current = new Set(this.selectedIds());
    const shift = (e.originalEvent as MouseEvent | undefined)?.shiftKey ?? false;
    if (shift) {
      if (current.has(id)) current.delete(id);
      else current.add(id);
    } else {
      current.clear();
      current.add(id);
    }
    this.selectedIds.set(current);

    const degree = (e.target.data('degree') as number | undefined) ?? 0;
    const node: GraphNode = {
      id,
      label: e.target.data('label'),
      properties: e.target.data('properties') ?? {},
      degree,
    };
    this.selectedNode.set(node);

    if (
      !shift &&
      degree > 0 &&
      degree <= KnowledgeGraphComponent.AUTO_EXPAND_MAX_DEGREE &&
      !this.expandedNodes.has(id)
    ) {
      this.expandedNodes.add(id);
      this.expandNode(id,  false);
    }
  }

  private onNodeDoubleTap(e: EventObject): void {
    const id = e.target.id() as string;
    this.expandNode(id);
  }

  private focusNode(id: string): void {
    if (!this.cy) return;
    const node = this.cy.getElementById(id);
    if (node.empty()) return;
    this.cy.animate({ center: { eles: node }, zoom: 1.1 }, { duration: 400 });
  }


  private mergeSubgraph(
    data: SubgraphResponse,
    opts: { runLayout?: boolean; sourceId?: string } = {},
  ): void {
    const cy = this.cy;
    if (!cy) return;

    const sourceNode = opts.sourceId ? cy.getElementById(opts.sourceId) : null;
    const sourcePos =
      sourceNode && !sourceNode.empty() ? sourceNode.position() : null;
    const outward = sourcePos ? this.findEmptyDirection(sourcePos) : null;

    const newNodeDefs: ElementDefinition[] = [];
    for (const n of data.nodes) {
      if (!cy.getElementById(n.id).empty()) continue;
      const def = this.toCyNode(n, data.truncated?.hidden_neighbors);
      newNodeDefs.push(def);
    }

    if (sourcePos && outward && newNodeDefs.length > 0) {
      const n = newNodeDefs.length;
      const baseAngle = Math.atan2(outward.y, outward.x);
      const spread = Math.min(Math.PI * 1.1, Math.PI * 0.45 + n * 0.07);
      const radius = 220 + n * 12;
      newNodeDefs.forEach((def, i) => {
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        const angle = baseAngle + t * spread;
        def.position = {
          x: sourcePos.x + Math.cos(angle) * radius,
          y: sourcePos.y + Math.sin(angle) * radius,
        };
      });
    }

    const toAdd: ElementDefinition[] = [...newNodeDefs];
    for (const edge of data.edges) {
      if (!cy.getElementById(edge.id).empty()) continue;
      toAdd.push(this.toCyEdge(edge));
    }

    if (toAdd.length > 0) {
      cy.add(toAdd);
      this.updateCounts();
      this.runLayoutAndFit();
    } else if (opts.runLayout) {
      this.runLayoutAndFit();
    }
  }


  private findEmptyDirection(from: { x: number; y: number }): { x: number; y: number } {
    const cy = this.cy;
    if (!cy) return { x: 1, y: 0 };

    const SECTORS = 12;
    const counts = new Array<number>(SECTORS).fill(0);
    const TWO_PI = Math.PI * 2;

    cy.nodes().forEach((n) => {
      const p = n.position();
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += TWO_PI;
      const idx = Math.floor((angle / TWO_PI) * SECTORS) % SECTORS;
      counts[idx] += 600 / (dist + 60);
    });

    let bestIdx = 0;
    for (let i = 1; i < SECTORS; i++) {
      if (counts[i] < counts[bestIdx]) bestIdx = i;
    }
    const angle = (bestIdx + 0.5) * (TWO_PI / SECTORS);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }


  private static readonly MIN_LAYOUT_CANVAS_PX = 80;


  private static readonly MAX_LAYOUT_DEFER_FRAMES = 15;

  private runLayoutAndFit(attempt = 0): void {
    const cy = this.cy;
    if (!cy || cy.nodes().length === 0) return;

    requestAnimationFrame(() => {
      const cyNow = this.cy;
      if (!cyNow || cyNow.nodes().length === 0) return;

      cyNow.resize();

      const w = this.cyContainer.nativeElement.clientWidth;
      const h = this.cyContainer.nativeElement.clientHeight;
      const tooSmall =
        w < KnowledgeGraphComponent.MIN_LAYOUT_CANVAS_PX ||
        h < KnowledgeGraphComponent.MIN_LAYOUT_CANVAS_PX;

      if (tooSmall && attempt < KnowledgeGraphComponent.MAX_LAYOUT_DEFER_FRAMES) {
        this.runLayoutAndFit(attempt + 1);
        return;
      }

      const randomize = !this.hasLaidOutOnce;

      const layout = cyNow.layout({ ...FCOSE_LAYOUT, randomize } as any);
      layout.one('layoutstop', () => {
        this.hasLaidOutOnce = true;
        cyNow.fit(undefined, 80);
        const z = cyNow.zoom();
        if (z > 1.4) cyNow.zoom(1.4);
        else if (z < 0.5) cyNow.zoom(0.5);
      });
      layout.run();
    });
  }

  private replaceSubgraph(data: SubgraphResponse): void {
    const cy = this.cy;
    if (!cy) return;

    cy.elements().remove();

    this.hasLaidOutOnce = false;
    cy.add([
      ...data.nodes.map((n) => this.toCyNode(n, data.truncated?.hidden_neighbors)),
      ...data.edges.map((e) => this.toCyEdge(e)),
    ]);
    this.updateCounts();
    this.runLayoutAndFit();
  }

  private toCyNode(n: NodeWithView, hiddenNeighbors?: number): ElementDefinition {
    const lbl = n.label ?? '';
    const displayFields = this.schema()?.label_display_fields ?? {};

    const displayKey =
      displayFields[lbl] ??
      Object.entries(displayFields).find(([k]) => k.toLowerCase() === lbl.toLowerCase())?.[1] ??
      'name';
    const raw = (n.properties?.[displayKey] as string | undefined) ?? n.id;
    const trimmed = raw.length > 36 ? raw.slice(0, 34) + '…' : raw;
    const label = hiddenNeighbors && hiddenNeighbors > 0 ? `${trimmed}\n+${hiddenNeighbors}` : trimmed;

    const palette = colourForLabel(lbl, this.allLabels());

    return {
      group: 'nodes',
      data: {
        id: n.id,
        label: lbl,
        displayLabel: label,
        properties: n.properties,
        degree: n.degree ?? 0,
        fill: palette.fill,
        textColor: palette.text,
      },
    };
  }

  private toCyEdge(e: GraphEdge): ElementDefinition {
    return {
      group: 'edges',
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        properties: e.properties,
      },
    };
  }

  private updateCounts(): void {
    const cy = this.cy;
    if (!cy) return;
    const map: Record<string, number> = {};
    cy.nodes().forEach((n) => {
      const label = (n.data('label') as string | undefined) ?? 'Unknown';
      map[label] = (map[label] ?? 0) + 1;
    });
    this.canvasCounts.set(map);
    this.absorbLabels(Object.keys(map));
  }

  private absorbLabels(labels: Array<string | undefined | null>): void {
    const known = new Set([
      ...(this.schema()?.labels ?? []).map((l) => l.toLowerCase()),
      ...this.extraLabels().map((l) => l.toLowerCase()),
    ]);
    const added: string[] = [];
    for (const raw of labels) {
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      added.push(raw);
    }
    if (added.length === 0) return;
    this.extraLabels.update((prev) => [...prev, ...added]);

    const nextFilter = { ...this.labelFilter() };
    for (const l of added) nextFilter[l] = true;
    this.labelFilter.set(nextFilter);
  }

  onToggleLabel(label: string, checked: boolean): void {
    const next = { ...this.labelFilter(), [label]: checked };
    this.labelFilter.set(next);

    const cy = this.cy;
    if (!cy) return;

    const target = label.toLowerCase();
    cy.nodes().forEach((n) => {
      const lbl = (n.data('label') as string | undefined) ?? '';
      if (lbl.toLowerCase() !== target) return;
      n.style('display', checked ? 'element' : 'none');
    });
  }


  zoomIn(): void {
    const cy = this.cy;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: this.center() });
  }

  zoomOut(): void {
    const cy = this.cy;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * 0.8, renderedPosition: this.center() });
  }

  resetView(): void {
    this.cy?.fit(undefined, 40);
  }

  private center(): { x: number; y: number } {
    const w = this.cyContainer.nativeElement.clientWidth;
    const h = this.cyContainer.nativeElement.clientHeight;
    return { x: w / 2, y: h / 2 };
  }

  displayNameFor(node: GraphNode | null): string {
    if (!node) return '';
    const key = this.schema()?.label_display_fields?.[node.label ?? ''] ?? 'name';
    return (node.properties?.[key] as string | undefined) ?? node.id;
  }


  private readonly INTERNAL_PDF_KEYS = new Set([
    'internal_pdf_url',
    'internalpdfurl',
    'pdf_url',
    'pdfurl',
  ]);

  private readonly PAPER_URL_KEYS = new Set(['paper_url', 'paperurl']);


  private resolveDoiHref(node: GraphNode, doi: string): string {
    if (this.canAccessReferences()) {
      for (const [k, v] of Object.entries(node.properties ?? {})) {
        if (!v) continue;
        const key = k.toLowerCase();
        if (this.INTERNAL_PDF_KEYS.has(key)) return String(v);
      }
    }
    for (const [k, v] of Object.entries(node.properties ?? {})) {
      if (!v) continue;
      const key = k.toLowerCase();
      if (this.PAPER_URL_KEYS.has(key)) return String(v);
    }
    return `https://doi.org/${doi}`;
  }


  nodeProperties(
    node: GraphNode | null,
  ): Array<{ key: string; value: string; href?: string; kind?: 'pdf' }> {
    if (!node) return [];
    return Object.entries(node.properties ?? {})
      .filter(([k, v]) => v !== null && v !== undefined && v !== '' && k.toLowerCase() !== 'id')
      .map(([key, value]) => {
        const str = String(value);
        const keyLower = key.toLowerCase();
        if (keyLower === 'doi') {
          return { key, value: str, href: this.resolveDoiHref(node, str) };
        }
        if (this.PAPER_URL_KEYS.has(keyLower) || this.INTERNAL_PDF_KEYS.has(keyLower)) {
          return { key, value: str, href: str, kind: 'pdf' as const };
        }
        return { key, value: str };
      });
  }

  paletteFor(label: string | undefined | null) {
    return colourForLabel(label ?? '', this.allLabels());
  }

  readonly palette = GRAPH_PALETTE;

  private handleError(context: string, err: unknown): void {
    console.error(`[KnowledgeGraph] ${context} failed`, err);
    this.errorMessage.set(`${context} failed. Please try again.`);
  }
}
