/** Request-local evidence, used only to distinguish failed reads from uncertain external mutations. */
export interface BaseWriteState { pending: number; uncertain: number }
export async function trackBaseMutation<T>(credentials: { BASE_WRITE_STATE?: BaseWriteState }, operation: () => Promise<T>): Promise<T> {
  const state = credentials.BASE_WRITE_STATE;
  if (state) state.pending += 1;
  try { return await operation(); }
  catch (cause) { if (state) state.uncertain += 1; throw cause; }
  finally { if (state) state.pending -= 1; }
}
