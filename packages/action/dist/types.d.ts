import type { VerifyInput, VerifyResult, RiskLevel } from '@strata-ai/sdk';
export interface FoundEntry {
    /** Friendly name from the config (e.g. "filesystem"). */
    name: string;
    /** Identifier suitable for verification, or null if unverifiable. */
    identifier: VerifyInput | null;
    /** Why the entry is unverifiable, when identifier is null. */
    reason?: string;
    /** Source path relative to the repo root. */
    sourcePath: string;
}
export interface VerifiedEntry extends FoundEntry {
    result: VerifyResult | null;
}
export interface ReportSummary {
    total: number;
    passed: number;
    warnings: number;
    critical: number;
    unverifiable: number;
    worst: RiskLevel;
}
