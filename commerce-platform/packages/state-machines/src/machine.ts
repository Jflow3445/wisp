export interface TransitionDefinition<State extends string, Action extends string> {
  from: readonly State[];
  to: State;
  requiresReason?: boolean;
  requiresEvidence?: boolean;
}

export type TransitionMap<State extends string, Action extends string> = Record<
  Action,
  TransitionDefinition<State, Action>
>;

export interface TransitionInput<State extends string, Action extends string> {
  currentState: State;
  action: Action;
  reason?: string | null;
  evidence?: Record<string, unknown> | null;
}

export class StateTransitionError extends Error {
  readonly code = "INVALID_STATE_TRANSITION";

  constructor(message: string) {
    super(message);
    this.name = "StateTransitionError";
  }
}

export function createMachine<State extends string, Action extends string>(transitions: TransitionMap<State, Action>) {
  return {
    transition(input: TransitionInput<State, Action>): State {
      const definition = transitions[input.action];
      if (!definition.from.includes(input.currentState)) {
        throw new StateTransitionError(`Cannot ${input.action} from ${input.currentState}`);
      }
      if (definition.requiresReason && !input.reason?.trim()) {
        throw new StateTransitionError(`${input.action} requires a reason`);
      }
      if (definition.requiresEvidence && (!input.evidence || Object.keys(input.evidence).length === 0)) {
        throw new StateTransitionError(`${input.action} requires evidence`);
      }
      return definition.to;
    },
    availableActions(state: State): Action[] {
      return (Object.entries(transitions) as [Action, TransitionDefinition<State, Action>][]) 
        .filter(([, definition]) => definition.from.includes(state))
        .map(([action]) => action);
    },
  };
}
