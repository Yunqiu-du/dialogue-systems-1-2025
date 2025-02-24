import { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import { AnyActorRef } from "xstate";

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  selectedPerson?: string;
  selectedDay?: string;
  selectedTime?: string;
  comfirmationStatus?: "confirmed" | "rejected" | "pending";
  MeetingDuration?: string;
  isFullDay?: boolean;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" } | { type: 'RECOGNISED'; value: string };
