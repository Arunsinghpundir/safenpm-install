declare module 'pacote' {
  export interface PacoteOptions {
    registry?: string;
    token?: string;
    cache?: string;
    preferOnline?: boolean;
    fullMetadata?: boolean;
  }

  export function packument(
    spec: string,
    opts?: PacoteOptions,
  ): Promise<{ versions: Record<string, unknown> }>;

  export function manifest(
    spec: string,
    opts?: PacoteOptions,
  ): Promise<unknown>;
}
