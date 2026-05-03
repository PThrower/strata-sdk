import type { VerifiedEntry, ReportSummary } from './types';
declare const MARKER = "<!-- strata-mcp-check -->";
export declare function summarize(entries: VerifiedEntry[]): ReportSummary;
export declare function buildMarkdown(entries: VerifiedEntry[], summary: ReportSummary): string;
export declare function postOrUpdateComment(args: {
    body: string;
    githubToken: string;
}): Promise<void>;
export { MARKER };
