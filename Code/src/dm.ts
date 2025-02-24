import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  person?: string;
  day?: string;
  time?: string;
  confirmation?: boolean;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  aya: { person: "Nayat Astaiza Soriano" },
  victoria: { person: "Victoria Daniilidou" },
  bella: { person: "Bella Du" },
  xin: { person: "Xin Bian" }, 

  monday: { day: "Monday" },
  tuesday: { day: "Tuesday" },
  wednesday: { day: "Wednesday" },
  thursday: { day: "Thursday" },
  friday: { day: "Friday" },
  today: { day: "Today" },
  tomorrow: { day: "Tomorrow" },
  next: { day: "Next week" },

  "10": { time: "10:00" },
  "11": { time: "11:00" },
  "12": { time: "12:00" },
  "13": { time: "13:00" },
  "15": { time: "15:00" },
  "17": { time: "17:00" },
  morning: { time: "9:00" },
  afternoon: { time: "14:30" },
  evening: { time: "19:00" },

  yes: { confirmation: true },
  "of course": { confirmation: true },
  "sure": { confirmation: true },
  "absolutely": { confirmation: true },
  no: { confirmation: false },
  "no way": { confirmation: false },
};

function parseUtterance(utterance: string): GrammarEntry | null {
  return grammar[utterance.toLowerCase()] || null;
}

function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

const dmMachine = setup({
  types: {
    /** you might need to extend these */
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    /** define your actions here */
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
      }),
  },
}).createMachine({
  context: ({ spawn}) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "Welcome" },
    },
    Welcome: {
      entry: [
        { type: "spst.speak", params: {utterance: "Let's create an appointment!" } },
        { type: "spst.listen" }
      ],
      on: { SPEAK_COMPLETE: "AskPerson" },
    },
    AskPerson: {
      entry: { type: "spst.speak", params: { utterance: "Who are you meeting with?" } },
      on: { SPEAK_COMPLETE: "ListenPerson" },
    },
    NoInput: {
      entry: { type: "spst.speak", params: { utterance: "I can't hear you! Who are you meeting with?" } },
      on: { SPEAK_COMPLETE: "ListenPerson" },
  },
    ListenPerson: {
      entry: { type: 'spst.listen' },
      on: {
        RECOGNISED: {
          actions: assign(({ event, context }) => {
            const utterance = String(event.value);
            const result = parseUtterance(utterance);
            return result?.person ? { selectedPerson: result.person } : context;
          }),
          target: "AskDay",
        },
    },
  },
      AskDay: {
          entry: { type: "spst.speak", params: { utterance: "On which day is your meeting?" } },
          on: { SPEAK_COMPLETE: "ListenDay" },
        },
        NoInputDay: {
          entry: { type: "spst.speak", params: { utterance: "I can't hear a day! On which day is your meeting?" } },
          on: { SPEAK_COMPLETE: "ListenDay" },
        },
        ListenDay: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event, context }) => {
                const utterance = String(event.value);
                const result = parseUtterance(utterance);
                return result?.day ? { selectedDay: result.day } : context;
              }),
              target: "AskFullDay",
            },
          },
        },
        AskFullDay: {
          entry: { type: "spst.speak", params: { utterance: "Will it take the whole day?" } },
          on: { SPEAK_COMPLETE: "ListenFullDay" },
        },
        NoInputFullDay: {
          entry: { type: "spst.speak", params: { utterance: "I didn't hear that! Will it take the whole day?" } },
          on: { SPEAK_COMPLETE: "ListenFullDay" },
        },
        ListenFullDay: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: [
              {
                guard: ({ event }) => parseUtterance(String(event.value))?.confirmation === true,
                target: "ConfirmFullDay",
              },
              {
                guard: ({ event }) => parseUtterance(String(event.value))?.confirmation === false,
                target: "AskTime",
              },
            ],
          },
        },
        ConfirmFullDay: {
          entry: { type: "spst.speak", params: { utterance: "You confirmed the full day!" } },
          on: { SPEAK_COMPLETE: "Done" },
        },
        AskTime: {
          entry: { type: "spst.speak", params: { utterance: "What time is your meeting?" } },
          on: { SPEAK_COMPLETE: "ListenTime" },
        },
        NoInputTime: {
          entry: { type: "spst.speak", params: { utterance: "I didn't hear that! What time is your meeting?" } },
          on: { SPEAK_COMPLETE: "ListenTime" },
        },
        ListenTime: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event, context }) => {
                const utterance = String(event.value);
                const result = parseUtterance(utterance);
                return result?.time ? { selectedTime: result.time }: context;
              }),
              target: "ConfirmAppointment",
            },
          },
        },
        ConfirmAppointment: {
          entry: ({ context }) => {
            const message = `Do you want me to create an appointment with ${context.selectedPerson} on ${context.selectedDay} at ${context.selectedTime}?`;
            context.spstRef.send({ type: "SPEAK", value: { utterance: message } });
          },
          on: { SPEAK_COMPLETE: "ListenConfirmation" },
        },
        ListenConfirmation: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              guard: ({ event }) => parseUtterance(String(event.value))?.confirmation === true,
              target: "AppointmentCreated",
            },
          },
        },
        AppointmentCreated: {
          entry: { type: "spst.speak", params: { utterance: "Your appointment has been created!" } },
          on: { SPEAK_COMPLETE: "Done" },
        },
        Done: {
          on: { CLICK: "AskPerson" },
        },
      },
    });

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}