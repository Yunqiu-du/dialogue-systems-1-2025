import { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import { AnyActorRef } from "xstate";

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  appointment: {
    person: string | null;
    day: string | null;
    time: string | null;
    confirmation: string | null;
  };
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: 'RECOGNISED'; value: string };
