/** Compare complete unique ID sets without depending on SQL/JavaScript collation. */
export function sameUniqueIds(expected: readonly string[], actual: readonly string[]): boolean {
    const members = new Set(actual);
    return expected.length === actual.length
        && new Set(expected).size === expected.length
        && members.size === actual.length
        && expected.every(id => members.has(id));
}
