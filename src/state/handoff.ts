// One-shot hand-off of state to the next panel that opens with a given code (for example ASK -> EQS).
const box = new Map<string, unknown>();
export const handOff = (code: string, value: unknown) => void box.set(code, value);
export function takeHandOff<T>(code: string): T | undefined {
  const v = box.get(code) as T | undefined;
  box.delete(code);
  return v;
}
