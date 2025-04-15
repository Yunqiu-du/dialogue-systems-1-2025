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
  confirmation?: string;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  aya: { person: "Nayat Astaiza Soriano" },
  victoria: { person: "Victoria Daniilidou" },
  bella: { person: "Bella Du" },
  xin: { person: "Xin Bian" }, 
  jennie: { person: "Jennie Kim" },

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

  yes: { confirmation: "yes" },
  "of course": { confirmation: "yes" },
  "sure": { confirmation: "yes" },
  "absolutely": { confirmation: "yes" },
  no: { confirmation: "no" },
  "no way": { confirmation: "no" },
};

function isInGrammar(utterance: string) {
  return !!grammar[utterance.toLowerCase()];
}

function getPerson(utterance: string) {
  return grammar[utterance.toLowerCase()]?.person;
}

function getDay(utterance: string) {
  return grammar[utterance.toLowerCase()]?.day;
}

function getTime(utterance: string) {
  return grammar[utterance.toLowerCase()]?.time;
}

function getConfirmation(utterance: string) {
  return grammar[utterance.toLowerCase()]?.confirmation;
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
  id: "DM",
  initial: "Prepare",
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    appointment: {
      person: null,
      day: null,
      time: null,
      confirmation: null,
    },
  }),
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "Welcome" },
    },

    Welcome: {
      initial: "Createconversation",
      states: {
        Createconversation: {
          entry: [
            { type: "spst.speak", params: { utterance: "Let's create an appointment!" } },
          ],
          on: { SPEAK_COMPLETE: "AskPerson" },
        },
        AskPerson: {
          entry: { type: "spst.speak", params: { utterance: "Who are you meeting with?" } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: "I can't hear you! Who are you meeting with?" } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
              })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammar",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: "Welcome.NoInput" },
        ],
      },
    },

    CheckGrammar: {
      entry: [
        assign(({ context }) => {
          const utterance = context.lastResult?.[0]?.utterance.toLowerCase() || "";
          return {
            appointment: {
              ...context.appointment,
              person: getPerson(utterance) || context.appointment.person,
            },
          };
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
              isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
            } in your given list.`,
          }),
        },
      ],
      on: {
        SPEAK_COMPLETE: [
          {
            target: "AskDay",
            guard: ({ context }) => !!context.appointment.person,
          },
          { target: "Welcome.AskPerson" },
        ],
      },
    },

    AskDay: {
      initial: "AskDay",
      states: {
        AskDay: {
          entry: { type: "spst.speak", params: { utterance: "On which day is your meeting?" } },
          on: { SPEAK_COMPLETE: "Ask2" },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: "I can't hear a day! On which day is your meeting?" } },
          on: { SPEAK_COMPLETE: "Ask2" },
        },
        Ask2: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
              })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: "AskDay.NoInput" },
        ],
      },
    },

    CheckGrammarDay: {
      entry: [
        assign(({ context }) => {
          const utterance = context.lastResult?.[0]?.utterance.toLowerCase() || "";
          return {
            appointment: {
              ...context.appointment,
              day: getDay(utterance) || context.appointment.day,
            },
          };
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
              isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
            } in your given list.`,
          }),
        },
      ],
      on: {
        SPEAK_COMPLETE: [
          {
            target: "AskFullDay",
            guard: ({ context }) => !!context.appointment.day,
          },
          { target: "AskDay" },
        ],
      },
    },

    AskFullDay: {
      initial: "AskFullDay",
      states: {
        AskFullDay: {
          entry: { type: "spst.speak", params: { utterance: "Will it take the whole day?" } },
          on: { SPEAK_COMPLETE: "Ask3" },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: "I didn't hear that! Will it take the whole day?" } },
          on: { SPEAK_COMPLETE: "Ask3" },
        },
        NoInput2: {
          entry: { type: "spst.speak", params: { utterance: "It is not in the grammar! Will it take the whole day?" } },
          on: { SPEAK_COMPLETE: "Ask3" },
        },
        Ask3: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
              })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarFullDay",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: "AskFullDay.NoInput" },
        ],
      },
    },

    CheckGrammarFullDay: {
      entry: [
        assign(({ context }) => {
          const utterance = context.lastResult?.[0]?.utterance.toLowerCase() || "";
          return {
            appointment: {
              ...context.appointment,
              confirmation: getConfirmation(utterance) || context.appointment.confirmation,
            },
          };
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
              isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
            } in your given list.`,
          }),
        },
      ],
      on: {
        SPEAK_COMPLETE: [
          {
            target: "Confirmation",
            guard: ({ context }) => context.appointment.confirmation === "yes",
          },
          {
            target: "AskTime",
            guard: ({ context }) => context.appointment.confirmation === "no",
          },
          {
            target: "AskFullDay.NoInput2",
          },
        ],
      },
    },

    AskTime: {
      initial: "AskTime",
      states: {
        AskTime: {
          entry: { type: "spst.speak", params: { utterance: "What time is your meeting?" } },
          on: { SPEAK_COMPLETE: "Ask4" },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: "What time is your meeting?" } },
          on: { SPEAK_COMPLETE: "Ask4" },
        },
        Ask4: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
              })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarTime",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: "AskTime.NoInput" },
        ],
      },
    },

    CheckGrammarTime: {
      entry: [
        assign(({ context }) => {
          const utterance = context.lastResult?.[0]?.utterance.toLowerCase() || "";
          return {
            appointment: {
              ...context.appointment,
              time: getTime(utterance) || context.appointment.time,
            },
          };
        }),
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
              isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
            } in your given list.`,
          }),
        },
      ],
      on: {
        SPEAK_COMPLETE: [
          {
            target: "Confirmation",
            guard: ({ context }) => !!context.appointment.time,
          },
          { target: "AskTime" },
        ],
      },
    },

    Confirmation: {
      initial: "AskConfirmation",
      states: {
        AskConfirmation: {
          entry: [
            {
              type: "spst.speak",
              params: ({ context }) => ({
                utterance:
                  context.appointment.confirmation === "yes"
                    ? `Do you want me to create an appointment with ${context.appointment.person} on ${context.appointment.day} for the whole day?`
                    : `Do you want me to create an appointment with ${context.appointment.person} on ${context.appointment.day} at ${context.appointment.time}?`,
              }),
            },
          ],
          on: { SPEAK_COMPLETE: "Ask5" },
        },
        NoInput: {
          entry: { type: "spst.speak", params: { utterance: "I can't hear you! Please say yes or no" } },
          on: { SPEAK_COMPLETE: "Ask5" },
        },
        NoInput2: {
          entry: { type: "spst.speak", params: { utterance: "It is not in the grammar. Please say yes or no" } },
          on: { SPEAK_COMPLETE: "AskConfirmation" },
        },
        Ask5: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => ({
                lastResult: event.value,
              })),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
      on: {
        LISTEN_COMPLETE: [
          {
            target: "CheckGrammarConfirmation",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: "Confirmation.NoInput" },
        ],
      },
    },

    CheckGrammarConfirmation: {
      entry: [
        {
          type: "spst.speak",
          params: ({ context }) => ({
            utterance: `You just said: ${context.lastResult![0].utterance}. And it ${
              isInGrammar(context.lastResult![0].utterance) ? "is" : "is not"
            } in your given list.`,
          }),
        },
      ],
      on: {
        SPEAK_COMPLETE: [
          {
            target: "AppointmentCreated",
            guard: ({ context }) => getConfirmation(context.lastResult?.[0]?.utterance?.toLowerCase()) === "yes",
          },
          {
            target: "Welcome",
            guard: ({ context }) => getConfirmation(context.lastResult?.[0]?.utterance?.toLowerCase()) === "no",
          },
          {
            target: "Confirmation.NoInput2",
          },
        ],
      },
    },

    AppointmentCreated: {
      entry: { type: "spst.speak", params: { utterance: "Your appointment has been created." } },
      on: { CLICK: "Done" },
    },

    Done: {
      on: { CLICK: "Welcome" },
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