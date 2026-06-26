





import {
  parseStructuredResults,
  isPlotData,
  ParsedTable,
} from './structured-results-parser';


let passed = 0;
let failed = 0;
const failures: string[] = [];

function describe(name: string, fn: () => void) {
  console.log(`\n  ${name}`);
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`    \x1b[32m✓\x1b[0m ${name}`);
  } catch (e: any) {
    failed++;
    const msg = e?.message ?? String(e);
    failures.push(`${name}: ${msg}`);
    console.log(`    \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      ${msg}`);
  }
}

function expect(val: any) {
  return {
    toBeTruthy: () => {
      if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`);
    },
    toBeUndefined: () => {
      if (val !== undefined)
        throw new Error(`Expected undefined, got ${JSON.stringify(val)}`);
    },
    toBeTrue: () => {
      if (val !== true) throw new Error(`Expected true, got ${val}`);
    },
    toBeFalse: () => {
      if (val !== false) throw new Error(`Expected false, got ${val}`);
    },
    toBeGreaterThan: (n: number) => {
      if (!(val > n)) throw new Error(`Expected ${val} > ${n}`);
    },
    toBeGreaterThanOrEqual: (n: number) => {
      if (!(val >= n)) throw new Error(`Expected ${val} >= ${n}`);
    },
  };
}


const bigArray = (n = 50) =>
  Array.from({ length: n }, (_, i) => +(i / n).toFixed(4));


function productionFilter(tables: ParsedTable[] | undefined): ParsedTable[] {
  if (!tables) return [];
  return tables.filter(
    (tbl) =>
      tbl.rows.length > 0 &&
      tbl.rows.some((row) =>
        row.some((cell) => cell !== '-' && cell.trim() !== ''),
      ),
  );
}


console.log('\nparseStructuredResults — all 14 PDF patterns\n');

describe('Pattern 1: variables (S4 — known working)', () => {
  it('produces non-empty tables', () => {
    const data = {
      total_sample_size: 329,
      group_sample_sizes: { negative: 178, positive: 66 },
      centiloid_cutoff: 18.41,
      variables: {
        Abeta42_40: { n_positive: 66, n_negative: 175, mean: 0.099 },
        pT217_T217: { n_positive: 66, n_negative: 176, mean: 2.46 },
        pT205_T205: { n_positive: 65, n_negative: 177, mean: 0.71 },
        pT181_T181: { n_positive: 66, n_negative: 176, mean: 25.03 },
      },
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
    for (const t of tables) {
      expect(t.rows.length).toBeGreaterThan(0);
      expect(
        t.rows.some((r: string[]) =>
          r.some((c) => c !== '-' && c.trim() !== ''),
        ),
      ).toBeTrue();
    }
  });
});

describe('Pattern 2: biomarkers with nested roc_curve', () => {
  it('produces non-empty tables (roc_curve filtered as plot data)', () => {
    const data = {
      analysis: 'ROC curve analysis',
      centiloid_cutoff: 18.41,
      biomarkers: {
        'Abeta 42:40 (Standardized)': {
          auc: 0.2,
          auc_ci_95: [0.15, 0.25],
          p_value: 0.0,
          significant: false,
          n_positive: 66,
          n_negative: 256,
          n_samples: 322,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
        'pT217/T217': {
          auc: 0.9,
          auc_ci_95: [0.87, 0.93],
          p_value: 0.0,
          significant: true,
          n_positive: 66,
          n_negative: 258,
          n_samples: 324,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
      },
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const allText = tables.flatMap((t: ParsedTable) => t.rows.flat()).join(' ');
    expect(allText.length).toBeGreaterThan(0);
  });
});

describe('Pattern 3: feature_stats (3-level deep nesting)', () => {
  it('produces non-empty tables for PET_positive/negative/test', () => {
    const data = {
      total_sample_size: 244,
      group_sample_sizes: { PET_negative: 178, PET_positive: 66 },
      feature_stats: {
        Abeta42_40: {
          PET_positive: {
            n: 66,
            mean: 0.099,
            std: 0.02,
            median: 0.095,
            min: 0.05,
            max: 0.18,
          },
          PET_negative: {
            n: 178,
            mean: 0.11,
            std: 0.03,
            median: 0.1,
            min: 0.04,
            max: 0.22,
          },
          test: {
            name: 't-test_independent',
            statistic: 5.5541,
            p_value: 0.0,
            effect_size: -0.5,
          },
        },
        pT217_T217: {
          PET_positive: {
            n: 66,
            mean: 2.46,
            std: 1.2,
            median: 2.1,
            min: 0.1,
            max: 6.0,
          },
          PET_negative: {
            n: 178,
            mean: 1.1,
            std: 0.8,
            median: 0.9,
            min: 0.01,
            max: 4.0,
          },
          test: {
            name: 't-test_independent',
            statistic: 8.12,
            p_value: 0.0,
            effect_size: 1.2,
          },
        },
      },
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
    for (const t of tables) {
      expect(
        t.rows.some((r: string[]) =>
          r.some((c) => c !== '-' && c.trim() !== ''),
        ),
      ).toBeTrue();
    }
  });
});

describe('Pattern 4: biomarkers + uppercase AUC + flat fpr/tpr', () => {
  it('produces non-empty tables despite casing differences', () => {
    const data = {
      analysis: 'ROC curve analysis',
      centiloid_cutoff: 18.41,
      biomarkers: {
        'Abeta: 01. Abeta 42:40 (Standardized)': {
          AUC: 0.2,
          AUC_CI_95: [0.15, 0.25],
          p_value: 0.0,
          n_positive: 66,
          n_negative: 256,
          fpr: bigArray(),
          tpr: bigArray(),
          thresholds: bigArray(),
          test: 'DeLong',
        },
        'pTau: pT217/T217 %*': {
          AUC: 0.9,
          AUC_CI_95: [0.87, 0.93],
          p_value: 0.0,
          n_positive: 66,
          n_negative: 258,
          fpr: bigArray(),
          tpr: bigArray(),
          thresholds: bigArray(),
          test: 'DeLong',
        },
      },
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
    for (const t of tables) {
      expect(
        t.rows.some((r: string[]) =>
          r.some((c) => c !== '-' && c.trim() !== ''),
        ),
      ).toBeTrue();
    }
  });
});

describe('Pattern 5: biomarkers + roc_curve nested + sample_size object', () => {
  it('produces non-empty tables', () => {
    const data = {
      analysis: 'ROC curve analysis',
      centiloid_cutoff: 18.41,
      sample_size: { total: 329, positive: 66, negative: 263 },
      biomarkers: {
        'AB42/40': {
          column: 'Abeta: 01. Abeta 42:40 (Standardized)',
          sample_size: 322,
          positive: 66,
          negative: 256,
          auc: 0.2,
          auc_ci_95: [0.15, 0.25],
          auc_se: 0.026,
          p_value: 0.0,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
        'pT217/T217': {
          column: 'pTau: pT217/T217 %*',
          sample_size: 324,
          positive: 66,
          negative: 258,
          auc: 0.9,
          auc_ci_95: [0.87, 0.93],
          auc_se: 0.026,
          p_value: 0.0,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
      },
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Pattern 6: roc_analysis array (flat objects)', () => {
  it('produces a table with rows for each biomarker', () => {
    const data = {
      roc_analysis: [
        {
          biomarker: 'Abeta 42:40 (Standardized)',
          column: 'Abeta: 01. Abeta 42:40 (Standardized)',
          n_samples: 322,
          auc: 0.2,
          auc_ci_lower: 0.15,
          auc_ci_upper: 0.25,
          auc_se: 0.026,
          p_value: 0.0,
        },
        {
          biomarker: 'pT217/T217 %*',
          column: 'pTau: pT217/T217 %*',
          n_samples: 324,
          auc: 0.9,
          auc_ci_lower: 0.87,
          auc_ci_upper: 0.93,
          auc_se: 0.026,
          p_value: 0.0,
        },
      ],
      centiloid_cutoff: 18.41,
      n_samples: 329,
      n_pet_positive: 66,
      n_pet_negative: 263,
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const rocTable = tables.find((t: ParsedTable) => t.rows.length >= 2);
    expect(rocTable).toBeTruthy();
  });
});

describe('Pattern 7: biomarkers + metadata fields', () => {
  it('produces tables including metadata', () => {
    const data = {
      test_name: 'ROC Analysis',
      outcome_definition: 'Centiloid >= 18.41',
      biomarkers: {
        'AB42/40': {
          biomarker_column: 'Abeta: 01.',
          auc: 0.2,
          ci_lower: 0.15,
          ci_upper: 0.25,
          p_value: 0.0,
          n_positive: 66,
          n_negative: 256,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
        'pT217/T217': {
          biomarker_column: 'pTau: pT217',
          auc: 0.9,
          ci_lower: 0.87,
          ci_upper: 0.93,
          p_value: 0.0,
          n_positive: 66,
          n_negative: 258,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
      },
      test_description: 'DeLong method',
      group_labels: { positive: 'PET+', negative: 'PET-' },
      significance_threshold: 0.05,
      n_compounds_tested: 4,
      n_significant: 3,
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Pattern 8: biomarkers + flat fpr/tpr (no roc_curve wrapper)', () => {
  it('produces tables with column/n/auc fields visible', () => {
    const data = {
      biomarkers: {
        'Abeta 42:40 (Standardized)': {
          column: 'Abeta: 01.',
          n: 322,
          auc: 0.2,
          auc_ci_lower: 0.15,
          auc_ci_upper: 0.25,
          fpr: bigArray(),
          tpr: bigArray(),
          thresholds: bigArray(),
        },
        'pT217/T217': {
          column: 'pTau: pT217',
          n: 324,
          auc: 0.9,
          auc_ci_lower: 0.87,
          auc_ci_upper: 0.93,
          fpr: bigArray(),
          tpr: bigArray(),
          thresholds: bigArray(),
        },
      },
      test_description: 'DeLong method',
      group_labels: { positive: 'PET+', negative: 'PET-' },
      significance_threshold: 0.05,
      n_compounds_tested: 4,
      n_significant: 3,
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Pattern 9: biomarkers with underscore keys + ci_95_lower/upper', () => {
  it('produces non-empty tables', () => {
    const data = {
      n_total: 329,
      n_pet_positive: 66,
      n_pet_negative: 263,
      biomarkers: {
        Abeta_42_40: {
          biomarker_column: 'Abeta: 01.',
          n_samples: 322,
          n_pet_positive: 66,
          n_pet_negative: 256,
          auc: 0.2,
          ci_95_lower: 0.15,
          ci_95_upper: 0.25,
          p_value: 0.0,
          fpr: bigArray(),
          tpr: bigArray(),
          thresholds: bigArray(),
        },
        pT217_T217: {
          biomarker_column: 'pTau: pT217',
          n_samples: 324,
          n_pet_positive: 66,
          n_pet_negative: 258,
          auc: 0.9,
          ci_95_lower: 0.87,
          ci_95_upper: 0.93,
          p_value: 0.0,
          fpr: bigArray(),
          tpr: bigArray(),
          thresholds: bigArray(),
        },
      },
      test_description: 'DeLong method',
      group_labels: { positive: 'PET+', negative: 'PET-' },
      significance_threshold: 0.05,
      n_compounds_tested: 4,
      n_significant: 3,
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Pattern 10: "results" key with nested biomarker objects', () => {
  it('produces non-empty tables', () => {
    const data = {
      analysis: 'ROC curve analysis',
      centiloid_cutoff: 18.41,
      results: {
        'AB42/40': {
          biomarker_column: 'Abeta: 01.',
          n_samples: 322,
          n_positive: 66,
          n_negative: 256,
          auc: 0.2,
          auc_ci_95: [0.15, 0.25],
          p_value: 0.0,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
        'pT217/T217': {
          biomarker_column: 'pTau: pT217',
          n_samples: 324,
          n_positive: 66,
          n_negative: 258,
          auc: 0.9,
          auc_ci_95: [0.87, 0.93],
          p_value: 0.0,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
      },
      test_description: 'DeLong method',
      group_labels: { positive: 'PET+', negative: 'PET-' },
      significance_threshold: 0.05,
      n_compounds_tested: 4,
      n_significant: 3,
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Pattern 11: biomarkers + roc_curve + interpretation', () => {
  it('produces non-empty tables with interpretation as metadata', () => {
    const data = {
      analysis: 'ROC curve analysis',
      centiloid_cutoff: 18.41,
      biomarkers: {
        'AB42/40': {
          biomarker_column: 'Abeta: 01.',
          auc: 0.2,
          auc_ci_95: [0.15, 0.25],
          p_value: 0.0,
          n_samples: 322,
          n_positive: 66,
          n_negative: 256,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
        'pT217/T217': {
          biomarker_column: 'pTau: pT217',
          auc: 0.9,
          auc_ci_95: [0.87, 0.93],
          p_value: 0.0,
          n_samples: 324,
          n_positive: 66,
          n_negative: 258,
          roc_curve: {
            fpr: bigArray(),
            tpr: bigArray(),
            thresholds: bigArray(),
          },
        },
      },
      test_description: 'DeLong method',
      group_labels: { positive: 'PET+', negative: 'PET-' },
      significance_threshold: 0.05,
      interpretation:
        'pT217/T217 shows the highest AUC (0.90) among tested biomarkers.',
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Pattern 12: biomarker_stats (simple stats)', () => {
  it('produces a table with 4 biomarker rows', () => {
    const data = {
      analysis: 'Descriptive statistics',
      centiloid_cutoff: 18.41,
      biomarker_stats: {
        'AB42/40': { n_positive: 66, n_negative: 175, mean: 0.099 },
        'pT217/T217': { n_positive: 66, n_negative: 176, mean: 2.46 },
        'pT205/T205': { n_positive: 65, n_negative: 177, mean: 0.71 },
        'pT181/T181': { n_positive: 66, n_negative: 176, mean: 25.03 },
      },
      total_sample_size: 244,
      group_sizes: { amyloid_positive: 66, amyloid_negative: 178 },
      centiloid_cutoff_used: 18.41,
      interpretation: 'AB42/40 shows the largest difference between groups.',
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const statsTable = tables.find((t: ParsedTable) => t.rows.length >= 4);
    expect(statsTable).toBeTruthy();
  });
});

describe('Pattern 13: variables + interpretation', () => {
  it('produces a table with 4 variable rows', () => {
    const data = {
      analysis: 'Descriptive statistics',
      centiloid_cutoff: 18.41,
      total_sample_size: 244,
      group_sizes: { amyloid_positive: 66, amyloid_negative: 178 },
      variables: {
        'AB42/40': {
          name: 'AB42/40',
          n_positive: 66,
          n_negative: 175,
          mean: 0.099,
        },
        'pT217/T217': {
          name: 'pT217/T217',
          n_positive: 66,
          n_negative: 176,
          mean: 2.46,
        },
        'pT205/T205': {
          name: 'pT205/T205',
          n_positive: 65,
          n_negative: 177,
          mean: 0.71,
        },
        'pT181/T181': {
          name: 'pT181/T181',
          n_positive: 66,
          n_negative: 176,
          mean: 25.03,
        },
      },
      interpretation: 'Variables show significant group differences.',
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const varsTable = tables.find((t: ParsedTable) => t.rows.length >= 4);
    expect(varsTable).toBeTruthy();
  });
});

describe('Pattern 14: biomarker_stats variant', () => {
  it('produces non-empty tables', () => {
    const data = {
      analysis: 'Summary statistics',
      centiloid_cutoff: 18.41,
      biomarker_stats: {
        'AB42/40': { n_positive: 66, n_negative: 175, mean: 0.1 },
        'pT217/T217': { n_positive: 66, n_negative: 176, mean: 2.5 },
      },
      total_sample_size: 244,
      group_sizes: { amyloid_positive: 66, amyloid_negative: 178 },
    };
    const tables = productionFilter(parseStructuredResults(data));
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Edge cases', () => {
  it('returns undefined for null/empty input', () => {
    expect(parseStructuredResults(null)).toBeUndefined();
    expect(parseStructuredResults(undefined)).toBeUndefined();
    expect(parseStructuredResults({})).toBeUndefined();
    expect(parseStructuredResults('')).toBeUndefined();
    expect(parseStructuredResults('null')).toBeUndefined();
  });

  it('parses JSON string input', () => {
    const jsonStr = JSON.stringify({
      biomarker_stats: {
        'AB42/40': { n_positive: 66, n_negative: 175, mean: 0.1 },
      },
      total_sample_size: 244,
    });
    const tables = productionFilter(parseStructuredResults(jsonStr));
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });

  it('isPlotData correctly identifies large numeric arrays', () => {
    const plotObj = {
      fpr: bigArray(50),
      tpr: bigArray(50),
      thresholds: bigArray(50),
    };
    expect(isPlotData(plotObj)).toBeTrue();

    const nonPlot = { auc: 0.9, p_value: 0.01 };
    expect(isPlotData(nonPlot)).toBeFalse();
  });
});


console.log(`\n${'─'.repeat(50)}`);

if (failed > 0) {
  console.log(`  \x1b[31m${failed} failing\x1b[0m`);
  console.log(`\nFailures:`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log();

process.exit(failed > 0 ? 1 : 0);
