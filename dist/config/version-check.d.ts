interface VersionCheckResult {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
}
export declare function checkForUpdate(baseUrl: string): Promise<VersionCheckResult | null>;
export {};
