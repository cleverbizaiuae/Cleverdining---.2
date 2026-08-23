export type PreparationTimeSource = {
  preparation_time_minutes?: unknown;
  preparation_time_min?: unknown;
  preparation_time_max?: unknown;
  preparation_time?: unknown;
  estimated_preparation_time?: unknown;
};

type PreparationTimeRange = {
  min: number;
  max: number;
};

const toPositiveMinutes = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
};

const parseTimeValue = (value: unknown): PreparationTimeRange | null => {
  const singleValue = toPositiveMinutes(value);
  if (singleValue !== null) return { min: singleValue, max: singleValue };
  if (typeof value !== "string") return null;

  const matches = value.match(/\d+(?:\.\d+)?/g) || [];
  const minutes = matches
    .slice(0, 2)
    .map(toPositiveMinutes)
    .filter((entry): entry is number => entry !== null);
  if (!minutes.length) return null;

  return {
    min: Math.min(...minutes),
    max: Math.max(...minutes),
  };
};

export const getPreparationTimeRange = (
  source?: PreparationTimeSource | null,
): PreparationTimeRange | null => {
  if (!source) return null;

  const configuredMin = toPositiveMinutes(source.preparation_time_min);
  const configuredMax = toPositiveMinutes(source.preparation_time_max);
  if (configuredMin !== null || configuredMax !== null) {
    const first = configuredMin ?? configuredMax;
    const second = configuredMax ?? configuredMin;
    if (first === null || second === null) return null;
    return {
      min: Math.min(first, second),
      max: Math.max(first, second),
    };
  }

  return (
    parseTimeValue(source.preparation_time_minutes) ||
    parseTimeValue(source.preparation_time) ||
    parseTimeValue(source.estimated_preparation_time)
  );
};

export const getPreparationTimeLabel = (
  source?: PreparationTimeSource | null,
): string | null => {
  const range = getPreparationTimeRange(source);
  if (!range) return null;
  return range.min === range.max
    ? `${range.min} min`
    : `${range.min}-${range.max} min`;
};
