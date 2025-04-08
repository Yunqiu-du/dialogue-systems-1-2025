import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://dialoguesystem-lab4.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  deploymentName: "appointment-lab4",
  projectName: "assignment-lab4",
};

const settings: Settings = {
  azureLanguageCredentials: azureLanguageCredentials,
  azureCredentials: azureCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

const famousPeople: Record<string, string> = {
  "Jennie": "Jennie is a member of BLACKPINK, known for her charismatic stage presence and fashion influence. She recently released her solo album 'RUBY' and is also active in the fashion industry as a brand ambassador.",
  "Rosé": "Rosé is the main vocalist of BLACKPINK. She is praised for her unique voice and emotional delivery in performances. Her single APT has gone viral lately.",
  "Taylor": "Taylor Swift is a globally acclaimed singer-songwriter known for her narrative songwriting style. She has won multiple Grammy Awards and is known for albums like '1989', 'Red', and 'Midnights'. She recently completed her Eras Tour.",
};

const grammar: Record<string, GrammarEntry> = {
  "jennie": { person: "Jennie Kim" },
  "rosé": { person: "Rosé" },
  "taylor": { person: "Taylor" },

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
  const cleanUtterance = utterance.toLowerCase().replace(/\s+/g, ''); 
  return grammar[cleanUtterance] || null;
}

function getPerson(context: DMContext): string | null {
  return context.interpretation?.entities?.find(e => e.category === 'person')?.text ?? null;
}

function getMeetingTime(context: DMContext): string | null {
  return context.interpretation?.entities?.find(e => e.category === 'meeting_time')?.text ?? null;
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
        value: { nlu: true},
      }),

      assignInterpretation: assign(({ event }) => {
        console.log("Recognized event value:", event.value); 
        const interpretation = event.value;
        const topIntent = interpretation?.topIntent;
        const entities = interpretation?.entities || [];

        const person = entities.find(e => e.category === 'person')?.text || null;
        const meeting_time = entities.find(e => e.category === 'meeting_time')?.text || null;
        return {
          lastResult: interpretation,
          interpretation,
          person,
          meeting_time,
          topIntent,
        };
      }),

      setWhoIsX: assign({
        person: (ctx) => ctx.person
      }),

      setMeetingInfo: assign({
        person: (ctx) => ctx.person,
        meeting_time: (ctx) => ctx.meeting_time,
      }),
    },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    person: null,
    meeting_time: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "Greeting" },
    },

    Greeting: {
      entry: { type: "spst.speak", params: { utterance: "How can I help you today?" } },
      on: { SPEAK_COMPLETE: "ListenIntent" },
    },

    ListenIntent: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: "assignInterpretation",
          target: "HandleIntent",
        },
      },
    },

    HandleIntent: {
      always: [
        {
          guard: ({ context }) => context.interpretation?.topIntent === "who_is_X",
          actions: "setWhoIsX",
          target: "WhoIsX",
        },
        {
          guard: ({ context }) => context.interpretation?.topIntent === "createMeeting",
          actions: "setMeetingInfo",
          target: "AskDay",
        },
        {
          target: "UnknownIntent",
        },
      ],
    },

    UnknownIntent: {
      entry: { type: "spst.speak", params: { utterance: "Sorry, I didn't understand that!" } },
      on: { SPEAK_COMPLETE: "Greeting" },
    },

    WhoIsX: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => {
          const person = context.person;
          if (person && famousPeople[person]) {
            return { utterance: famousPeople[person] };
          } else {
            return { utterance: person ? `Sorry, I don't have info on ${person}.` : "I couldn't identify the person." };
          }
        },
      },
      on: { SPEAK_COMPLETE: "Done"},
    },

    AskDay: {
      entry: { type: "spst.speak", params: { utterance: "On which day is your meeting?" } },
      on: { SPEAK_COMPLETE: "ListenDay" },
    },

    ListenDay: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event, context }) => {
            const result = parseUtterance(String(event.value));
            return result?.day ? { meeting_day: result.day } : context;
          }),
          target: "AskTime",
        },
      },
    },

    AskTime: {
      entry: { type: "spst.speak", params: { utterance: "What time is your meeting?" } },
      on: { SPEAK_COMPLETE: "ListenTime" },
    },

    ListenTime: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event, context }) => {
            const result = parseUtterance(String(event.value));
            return result?.time ? { meeting_time: result.time }: context;
          }),
          target: "ConfirmMeeting",
        },
      },
    },

    ConfirmMeeting: {
      entry: ({ context }) => {
        const utterance = `Do you want to create a meeting with ${context.person} on ${context.meeting_day} at ${context.meeting_time}?`;
        context.spstRef.send({ type: "SPEAK", value: { utterance } });
      },
      on: { SPEAK_COMPLETE: "ListenConfirmation" },
    },

    ListenConfirmation: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          {
            guard: ({ event }) => parseUtterance(String(event.value))?.confirmation === true,
            target: "AppointmentCreated",
          },
          {
            guard: ({ event }) => parseUtterance(String(event.value))?.confirmation === false,
            target: "Greeting",
          },
        ],
      },
    },

    AppointmentCreated: {
      entry: { type: "spst.speak", params: { utterance: "Your appointment has been created!" } },
      on: { SPEAK_COMPLETE: "Done" },
    },

    Done: {
      on: { CLICK: "Greeting" },
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