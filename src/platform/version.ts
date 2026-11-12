export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parses a strict `MAJOR.MINOR.PATCH` string. Throws on anything else. */
export function parseSemVer(input: string): SemVer {
  const match = SEMVER.exec(input);
  if (!match) {
    throw new Error(`Invalid semantic version: "${input}"`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}
