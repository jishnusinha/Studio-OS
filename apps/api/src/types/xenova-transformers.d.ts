declare module '@xenova/transformers' {
  export function pipeline(
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ): Promise<
    (
      text: string,
      opts?: { pooling?: string; normalize?: boolean },
    ) => Promise<{ data: Float32Array | number[] }>
  >;
}
