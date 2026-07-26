export type PageState = "ready" | "empty" | "error" | "permission";

export function resolvePageState(value: string | string[] | undefined): PageState {
  const state = Array.isArray(value) ? value[0] : value;
  return state === "empty" || state === "error" || state === "permission" ? state : "ready";
}
