type ObservedRound = { id: string; status: string; startedAt: string; serverNow: string };

// A snapshot can start during an uncommitted play. Its timestamp alone cannot
// override a confirmed receipt or move a completed round back into flight.
export function canObserveRound(known: ObservedRound | null, incoming: ObservedRound | undefined) {
  if (!known) return true;
  if (!incoming) return false;
  if (incoming.id !== known.id) return Date.parse(incoming.startedAt) > Date.parse(known.startedAt);
  if (known.status !== "FLYING" && incoming.status === "FLYING") return false;
  if (known.status === "FLYING" && incoming.status !== "FLYING") return true;
  return Date.parse(incoming.serverNow) >= Date.parse(known.serverNow);
}
