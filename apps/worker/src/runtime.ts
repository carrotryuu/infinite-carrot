export interface Closable {
  close(): Promise<void>;
}

export function shutdownOnce(resource: Closable): () => Promise<void> {
  let closing: Promise<void> | undefined;
  return () => (closing ??= resource.close());
}
