
export interface ParsedTable {
  title?: string;
  headers: string[];
  rows: string[][];
}


export function deepParseJsonStrings(data: any): any {
  if (data == null) return data;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
      try {
        return deepParseJsonStrings(JSON.parse(trimmed));
      } catch { return data; }
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => deepParseJsonStrings(item));
  }
  if (typeof data === 'object') {
    const result: any = {};
    for (const [key, val] of Object.entries(data)) {
      result[key] = deepParseJsonStrings(val);
    }
    return result;
  }
  return data;
}

export function formatTableTitle(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatCellValue(val: any): string {
  if (val == null) return '-';
  if (Array.isArray(val)) {
    if (val.length === 0) return '-';
    if (typeof val[0] !== 'object') {
      if (val.length <= 5) return val.map((v: any) =>
        typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v)
      ).join(', ');
      const preview = val.slice(0, 3).map((v: any) =>
        typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v)
      );
      return preview.join(', ') + ` ... (${val.length} total)`;
    }
    return val.map(v => flattenObjectToString(v)).join('; ');
  }
  if (typeof val === 'object') return flattenObjectToString(val);
  if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(4);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          return flattenObjectToString(parsed);
        }
      } catch {  }
    }
  }
  return String(val);
}

export function flattenObjectToString(obj: any, maxDepth = 2): string {
  if (!obj || typeof obj !== 'object') return String(obj ?? '-');
  if (Array.isArray(obj)) return obj.map(v => typeof v === 'object' ? flattenObjectToString(v, maxDepth - 1) : String(v)).join(', ');

  const entries = Object.entries(obj);
  if (!entries.length) return '-';

  return entries.map(([k, v]) => {
    const label = formatTableTitle(k);
    if (v == null) return `${label}: -`;
    if (typeof v === 'object' && maxDepth > 0) {
      return `${label}: ${flattenObjectToString(v, maxDepth - 1)}`;
    }
    if (typeof v === 'number') return `${label}: ${Number.isInteger(v) ? v : (v as number).toFixed(4)}`;
    return `${label}: ${v}`;
  }).join(', ');
}

export function isPlotData(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const values = Object.values(obj);
  if (values.length === 0) return false;
  return values.every(v => Array.isArray(v) && v.length > 20 && (v.length === 0 || typeof v[0] === 'number'));
}

export function arrayToTables(arr: any[], title?: string): ParsedTable[] {
  if (!arr.length) return [];

  if (typeof arr[0] !== 'object' || arr[0] === null) {
    return [{ title, headers: ['Value'], rows: arr.map(v => [String(v ?? '')]) }];
  }

  const headerSet = new Set<string>();
  for (const item of arr) {
    if (item && typeof item === 'object') {
      for (const k of Object.keys(item)) headerSet.add(k);
    }
  }
  const headers = Array.from(headerSet);

  const rows = arr.map(item => headers.map(h => {
    const val = item?.[h];
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      return flattenObjectToString(val);
    }
    return formatCellValue(val);
  }));

  return [{ title, headers: headers.map(h => formatTableTitle(h)), rows }];
}

export function objectToTables(data: any, title?: string): ParsedTable[] {
  if (!data || typeof data !== 'object') return [];
  const keys = Object.keys(data);
  if (!keys.length) return [];

  const objectEntries = keys.filter(k => typeof data[k] === 'object' && data[k] !== null && !Array.isArray(data[k]));

  if (objectEntries.length > 0) {
    const subKeySet = new Set<string>();
    for (const k of objectEntries) {
      for (const sk of Object.keys(data[k])) {
        subKeySet.add(sk);
      }
    }
    const subKeys = Array.from(subKeySet);

    const hasDeepNesting = objectEntries.some(k =>
      subKeys.some(sk => typeof data[k][sk] === 'object' && data[k][sk] !== null && !Array.isArray(data[k][sk]))
    );

    if (hasDeepNesting) {
      const tables: ParsedTable[] = [];
      for (const k of objectEntries) {
        const nested = data[k];
        if (isPlotData(nested)) continue;
        const nestedTables = parseStructuredResults(nested);
        if (nestedTables?.length) {
          nestedTables.forEach(t => {
            if (!t.title) t.title = formatTableTitle(k);
          });
          tables.push(...nestedTables);
        }
      }
      const primitiveKeys = keys.filter(k =>
        typeof data[k] !== 'object' || data[k] === null || Array.isArray(data[k])
      );
      if (primitiveKeys.length) {
        tables.push({
          title,
          headers: primitiveKeys.map(h => formatTableTitle(h)),
          rows: [primitiveKeys.map(k => formatCellValue(data[k]))],
        });
      }
      return tables.length ? tables : [];
    }

    const displaySubKeys = subKeys.filter(sk => {
      return !objectEntries.every(k => {
        const v = data[k][sk];
        return Array.isArray(v) && v.length > 10 && (v.length === 0 || typeof v[0] === 'number');
      });
    });

    const headers = ['Name', ...displaySubKeys.map(sk => formatTableTitle(sk))];
    const rows = objectEntries.map(k => {
      const obj = data[k];
      return [formatTableTitle(k), ...displaySubKeys.map(sk => formatCellValue(obj[sk]))];
    });

    const primitiveKeys = keys.filter(k =>
      typeof data[k] !== 'object' || data[k] === null || Array.isArray(data[k])
    );
    const tables: ParsedTable[] = [{ title, headers, rows }];
    if (primitiveKeys.length) {

      const overlapping = primitiveKeys.filter(pk => displaySubKeys.includes(pk));
      if (overlapping.length > 0) {
        const summaryRow = ['Overall', ...displaySubKeys.map(sk => {
          const prim = overlapping.find(pk => pk === sk);
          return prim ? formatCellValue(data[prim]) : '-';
        })];
        const hasValues = summaryRow.some((v, i) => i > 0 && v !== '-');
        if (hasValues) rows.push(summaryRow);
      }
      const nonOverlapping = primitiveKeys.filter(pk => !displaySubKeys.includes(pk));
      if (nonOverlapping.length > 0) {
        tables.push({
          title: title ? `${title}` : undefined,
          headers: nonOverlapping.map(h => formatTableTitle(h)),
          rows: [nonOverlapping.map(k => formatCellValue(data[k]))],
        });
      }
    }

    return tables;
  }

  const headers = keys.map(k => formatTableTitle(k));
  const row = keys.map(k => formatCellValue(data[k]));
  return [{ title, headers, rows: [row] }];
}

export function parseStructuredResults(data: any): ParsedTable[] | undefined {
  if (!data) return undefined;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed === '{}' || trimmed === '[]' || trimmed === 'null' || trimmed === '') return undefined;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  data = deepParseJsonStrings(data);

  if (typeof data === 'object' && data !== null && !Array.isArray(data) && Object.keys(data).length === 0) {
    return undefined;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return undefined;
    return arrayToTables(data);
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (!keys.length) return undefined;

    const hasNestedArrays = keys.some(k =>
      Array.isArray(data[k]) && data[k].length > 0 && typeof data[k][0] === 'object' && data[k][0] !== null
    );
    if (hasNestedArrays) {
      const tables: ParsedTable[] = [];
      for (const key of keys) {
        const val = data[key];
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
          tables.push(...arrayToTables(val, formatTableTitle(key)));
        } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          if (!isPlotData(val)) {
            tables.push(...objectToTables(val, formatTableTitle(key)));
          }
        }
      }
      const summaryKeys = keys.filter(k => {
        const v = data[k];
        if (v == null) return false;
        if (Array.isArray(v)) return v.length === 0 || typeof v[0] !== 'object';
        return typeof v !== 'object';
      });
      if (summaryKeys.length) {
        tables.unshift({
          headers: summaryKeys.map(h => formatTableTitle(h)),
          rows: [summaryKeys.map(k => formatCellValue(data[k]))],
        });
      }
      return tables.length ? tables : undefined;
    }

    const hasNestedObjects = keys.some(k => typeof data[k] === 'object' && data[k] !== null && !Array.isArray(data[k]));
    if (hasNestedObjects) {
      return objectToTables(data);
    }

    const headers = keys;
    const row = keys.map(k => formatCellValue(data[k]));
    return [{ headers: headers.map(h => formatTableTitle(h)), rows: [row] }];
  }

  return undefined;
}
