export function reportSideEffectFailure(operation: string, error: unknown): void {
  if (__DEV__) {
    console.error(
      `[persistence] ${operation} failed`,
      error instanceof Error ? error.name : 'UnknownError',
    );
  }
}
