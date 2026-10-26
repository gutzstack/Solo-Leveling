/**
 * NHANES benchmark specifications. Every metric/variable mapping here was checked against the
 * NHANES codebooks for the listed cycle.
 *
 * Official documentation:
 *   2017–2018: https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?BeginYear=2017
 *   2013–2014: https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?BeginYear=2013
 */

export interface NhanesFile {
  name: string; // e.g. DEMO_J
  cycleYear: number; // first year of cycle (2017)
  /** record count from the CDC data documentation; the build refuses files that don't match */
  expectedRecords: number;
}

export const NHANES_FILES: NhanesFile[] = [
  { name: "DEMO_J", cycleYear: 2017, expectedRecords: 9254 },
  { name: "BMX_J", cycleYear: 2017, expectedRecords: 8704 },
  { name: "DEMO_H", cycleYear: 2013, expectedRecords: 10175 },
  { name: "BPX_H", cycleYear: 2013, expectedRecords: 9813 },
  { name: "SLQ_H", cycleYear: 2013, expectedRecords: 6464 },
];

/** Official download locations (CDC moved files under /Nchs/Data/Nhanes/Public/ in 2024). */
export function officialUrls(f: NhanesFile): string[] {
  const span = `${f.cycleYear}-${f.cycleYear + 1}`;
  return [
    `https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/${f.cycleYear}/DataFiles/${f.name}.xpt`,
    `https://wwwn.cdc.gov/Nchs/Nhanes/${span}/${f.name}.XPT`,
  ];
}

export interface NhanesSpec {
  metricId: string;
  sourceId: "nhanes_2017_2018" | "nhanes_2013_2014";
  demoFile: string;
  dataFile: string;
  variable: string;
  variableLabel: string;
  weightVar: "WTMEC2YR" | "WTINT2YR";
  /** inclusive valid range; codes such as 77/99 (refused/don't know) fall outside and are dropped */
  validRange: [number, number];
  excludePregnant: boolean;
  units: string;
  decimals: number;
  notes: string;
}

export const AGE_BANDS: [number, number][] = [[20, 24]];

export const NHANES_SPECS: NhanesSpec[] = [
  {
    metricId: "body_weight",
    sourceId: "nhanes_2017_2018",
    demoFile: "DEMO_J",
    dataFile: "BMX_J",
    variable: "BMXWT",
    variableLabel: "Weight (kg), measured in the MEC",
    weightVar: "WTMEC2YR",
    validRange: [20, 300],
    excludePregnant: true,
    units: "kg",
    decimals: 1,
    notes: "Measured weight. Pregnant participants excluded (NCHS anthropometric-reference convention). Descriptive comparison only.",
  },
  {
    metricId: "height",
    sourceId: "nhanes_2017_2018",
    demoFile: "DEMO_J",
    dataFile: "BMX_J",
    variable: "BMXHT",
    variableLabel: "Standing height (cm), measured in the MEC",
    weightVar: "WTMEC2YR",
    validRange: [100, 230],
    excludePregnant: true,
    units: "cm",
    decimals: 1,
    notes: "Measured standing height. Descriptive comparison only.",
  },
  {
    metricId: "waist_circumference",
    sourceId: "nhanes_2017_2018",
    demoFile: "DEMO_J",
    dataFile: "BMX_J",
    variable: "BMXWAIST",
    variableLabel: "Waist circumference (cm), measured at the iliac crest",
    weightVar: "WTMEC2YR",
    validRange: [40, 220],
    excludePregnant: true,
    units: "cm",
    decimals: 1,
    notes: "Measured just above the uppermost lateral border of the ilium (iliac crest). Compare only with the same landmark.",
  },
  {
    metricId: "bmi",
    sourceId: "nhanes_2017_2018",
    demoFile: "DEMO_J",
    dataFile: "BMX_J",
    variable: "BMXBMI",
    variableLabel: "Body Mass Index (kg/m²) from measured height and weight",
    weightVar: "WTMEC2YR",
    validRange: [10, 90],
    excludePregnant: true,
    units: "kg/m²",
    decimals: 1,
    notes: "Computed by NCHS from measured height and weight. Descriptive only.",
  },
  {
    metricId: "resting_hr",
    sourceId: "nhanes_2013_2014",
    demoFile: "DEMO_H",
    dataFile: "BPX_H",
    variable: "BPXPLS",
    variableLabel: "60-second pulse (30-second radial pulse × 2), seated after 5 minutes' rest",
    weightVar: "WTMEC2YR",
    validRange: [30, 200],
    excludePregnant: true,
    units: "bpm",
    decimals: 0,
    notes: "Seated resting radial pulse taken by trained examiners in the MEC. Pregnant participants excluded. NHANES values are even numbers (30 s × 2), so ties are common. Morning wearable readings run lower than a seated clinic measurement.",
  },
  {
    metricId: "sleep_duration",
    sourceId: "nhanes_2013_2014",
    demoFile: "DEMO_H",
    dataFile: "SLQ_H",
    variable: "SLD010H",
    variableLabel: "Self-reported usual sleep on weekdays/workdays (hours)",
    weightVar: "WTINT2YR",
    validRange: [2, 12],
    excludePregnant: false,
    units: "hours",
    decimals: 1,
    notes: "Self-reported usual weekday/workday sleep in whole hours (12 = 12 or more). Interview-weighted. Descriptive only; sleep is ranked by 7–9 h goal attainment, not by having more of it.",
  },
];

export interface SourceMeta {
  id: string;
  name: string;
  url: string;
  publicationYear: number;
  population: string;
  statisticalMethod: string;
  files: string[];
}

export const SOURCE_META: Record<NhanesSpec["sourceId"], SourceMeta> = {
  nhanes_2017_2018: {
    id: "nhanes_2017_2018",
    name: "National Health and Nutrition Examination Survey 2017–2018 (DEMO_J, BMX_J)",
    url: "https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?BeginYear=2017",
    publicationYear: 2020,
    population:
      "Nationally representative sample of the U.S. civilian non-institutionalized population. Benchmarks use participants aged 20–24 examined in the Mobile Examination Center.",
    statisticalMethod:
      "Survey-weighted empirical cumulative distribution using the 2-year MEC exam weight (WTMEC2YR). Uncertainty is a 95% Wilson interval at the Kish effective sample size.",
    files: ["DEMO_J", "BMX_J"],
  },
  nhanes_2013_2014: {
    id: "nhanes_2013_2014",
    name: "National Health and Nutrition Examination Survey 2013–2014 (DEMO_H, BPX_H, SLQ_H)",
    url: "https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?BeginYear=2013",
    publicationYear: 2015,
    population:
      "Nationally representative sample of the U.S. civilian non-institutionalized population. Benchmarks use participants aged 20–24.",
    statisticalMethod:
      "Survey-weighted empirical cumulative distribution: MEC exam weight (WTMEC2YR) for examination measures, interview weight (WTINT2YR) for questionnaire items. Uncertainty is a 95% Wilson interval at the Kish effective sample size.",
    files: ["DEMO_H", "BPX_H", "SLQ_H"],
  },
};
