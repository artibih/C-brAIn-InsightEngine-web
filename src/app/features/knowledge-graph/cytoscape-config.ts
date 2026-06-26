import type { StylesheetCSS } from 'cytoscape';


export const GRAPH_PALETTE = [
  { fill: '#d4a574', text: '#5b3a16' }, 
  { fill: '#4fd1c5', text: '#134e4a' }, 
  { fill: '#f687b3', text: '#702444' }, 
  { fill: '#9ae6b4', text: '#1f5132' }, 
  { fill: '#63b3ed', text: '#1e3a8a' }, 
  { fill: '#f6ad55', text: '#7c2d12' }, 
  { fill: '#b794f4', text: '#44337a' }, 
  { fill: '#fbb6ce', text: '#702459' }, 
  { fill: '#f6e05e', text: '#5b3e00' }, 
  { fill: '#fc8181', text: '#7b1d1d' }, 
];


export function colourForLabel(label: string, allLabels: string[]) {
  if (!label) return GRAPH_PALETTE[0];
  const target = label.toLowerCase();
  const idx = allLabels.findIndex((l) => l.toLowerCase() === target);
  if (idx !== -1) return GRAPH_PALETTE[idx % GRAPH_PALETTE.length];

  let hash = 0;
  for (let i = 0; i < target.length; i++) {
    hash = (hash * 31 + target.charCodeAt(i)) >>> 0;
  }
  return GRAPH_PALETTE[hash % GRAPH_PALETTE.length];
}

export interface GraphStyleOptions {
  labels: string[];
}

export function buildStylesheet(opts: GraphStyleOptions): StylesheetCSS[] {
  const base: StylesheetCSS[] = [
    {
      selector: 'node',
      css: {
        'background-color': 'data(fill)',
        'label': 'data(displayLabel)',
        'color': 'data(textColor)',
        'font-size': 12,
        'font-weight': 500,
        'font-family':
          '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-overflow-wrap': 'anywhere',
        'text-max-width': '74',
        'line-height': 1.2,
        'width': 104,
        'height': 104,
        'border-width': 0,
        'overlay-opacity': 0,
        'text-outline-color': '#ffffff',
        'text-outline-width': 0.6,
        'text-outline-opacity': 0.6,
        'shadow-blur': 14,
        'shadow-color': 'rgba(15, 23, 42, 0.14)',
        'shadow-offset-x': 0,
        'shadow-offset-y': 3,
        'shadow-opacity': 1,
      } as any,
    },
    {
      selector: 'node:selected',
      css: {
        'border-width': 1.5,
        'border-color': '#da0149',
        'shadow-blur': 18,
        'shadow-color': 'rgba(218, 1, 73, 0.22)',
      } as any,
    },
    {
      selector: 'node.dimmed',
      css: {
        'opacity': 0.25,
      },
    },
    {
      selector: 'node.highlighted',
      css: {
        'border-width': 1.5,
        'border-color': '#1a1844',
      },
    },
    {
      selector: 'edge',
      css: {
        'curve-style': 'bezier',
        'width': 1.4,
        'line-color': '#cbd5e1',
        'target-arrow-color': '#cbd5e1',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.0,
        'label': 'data(type)',
        'font-size': 9,
        'font-weight': 600,
        'font-family':
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        'color': '#475569',
        'text-transform': 'uppercase',
        'text-rotation': 'autorotate',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.96,
        'text-background-padding': '3',
        'text-background-shape': 'roundrectangle',
        'text-border-width': 1,
        'text-border-color': '#e5e7eb',
        'text-border-opacity': 1,
        'text-margin-y': -2,
      } as any,
    },
    {
      selector: 'edge.dimmed',
      css: { 'opacity': 0.15 },
    },
    {
      selector: 'edge.highlighted',
      css: {
        'line-color': '#1a1844',
        'target-arrow-color': '#1a1844',
        'width': 2.4,
      },
    },
  ];

  return base;
}

export const FCOSE_LAYOUT = {
  name: 'fcose',
  quality: 'proof',
  animate: true,
  animationDuration: 550,
  animationEasing: 'ease-out',
  randomize: true,
  nodeRepulsion: 28000,
  idealEdgeLength: 320,
  edgeElasticity: 0.18,
  gravity: 0.08,
  gravityRange: 5.0,
  gravityRangeCompound: 1.5,
  numIter: 4000,
  padding: 90,
  fit: true,
  nodeDimensionsIncludeLabels: true,
  uniformNodeDimensions: true,
  packComponents: false,
} as const;
