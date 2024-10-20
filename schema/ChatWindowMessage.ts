export type ChatWindowMessage = {
  content: string;
  role: "user" | "assistant";
  runId?: string;
  traceUrl?: string;
}