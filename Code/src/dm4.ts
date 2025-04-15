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
  "JennieKim": "Jennie is a member of BLACKPINK, known for her charismatic stage presence and fashion influence. She recently released her solo album 'RUBY' and is also active in the fashion industry as a brand ambassador.",
  "Rose": "Rosé is the main vocalist of BLACKPINK. She is praised for her unique voice and emotional delivery in performances. Her single APT has gone viral lately.",
  "Taylor": "Taylor Swift is a globally acclaimed singer-songwriter known for her narrative songwriting style. She has won multiple Grammy Awards and is known for albums like '1989', 'Red', and 'Midnights'. She recently completed her Eras Tour.",
  "JustinBieber": "Justin Bieber is a Canadian singer, songwriter, and global pop sensation who gained fame as a teenager. You must hear his songs like 'Baby', 'Sorry', and 'Peaches', Bieber has earned multiple Grammy Awards and continues to influence pop culture worldwide with his music and personal journey.",
  "SZA": "SZA is an American singer-songwriter and one of the leading figures in contemporary R&B. Her debut album 'Ctrl' received critical acclaim and was nominated for multiple Grammy Awards. Known for her soulful voice and introspective lyrics, SZA has become a defining voice in modern music.",
};


function getPerson(context: DMContext): string | null {
  if (context.interpretation && context.interpretation.entities) {
    const personEntity = context.interpretation.entities.find(
      entity => entity.category === 'person'
    );
    if (personEntity) {
      return personEntity.text;
    }
  }
  return null;
}

function getMeetingTime(context: DMContext): string | null {
  if (context.interpretation && context.interpretation.entities) {
  const timeEntity = context.interpretation.entities.find(
    entity => entity.category === 'meeting_time'
  );
  if (timeEntity) {
    return timeEntity.text;
  }
}
return null;
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

      setPerson: assign({
        person: ({ context }) => getPerson(context)
      }),

    setMeetingInfo: assign({
        person: ({ context }) => getPerson(context),
        meeting_time: ({ context }) => getMeetingTime(context)
      })
  },

}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    interpretation: null,
    person: null,
    meeting_time: null,
    famousPeople: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },

    WaitToStart: {
      on: { CLICK: "Greeting" },
    },

    Greeting: {
      initial: "Prompt",

      on: {
        LISTEN_COMPLETE: [
          {
            target: "WhoIsX",
            guard: ({ context }) => context.interpretation?.topIntent === "who_is_X",
            actions: { type: "setPerson"}
          },
          { 
            target: "CreateMeeting",
            guard: ({ context }) => context.interpretation?.topIntent === "createMeeting",
            actions: { type: "setMeetingInfo" }
          },
          { 
            target: ".NoInput" 
          },
        ],
      },

      states: {

        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `How can I help you today?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },

        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },

        Ask: {

          entry: { type: "spst.listen" },

          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return { lastResult: event.value, interpretation: event.nluValue };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),

            },
          },
        },
      },
    },

    WhoIsX: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => {
          const personName = context.person;

          if (personName && context.famousPeople[personName]) {
            return { utterance: context.famousPeople[personName] };
          } else {
            return {
              utterance: personName
                ? `Sorry, I don't have any information about ${personName}.`
                : "I tried to fetch a person and failed miserably.",
            };
          }
        },
      },
      on: { SPEAK_COMPLETE: "Done" },
    },

    CreateMeeting: { 
      entry: {
        type: "spst.speak",
        params: ({ context }) => {
          const person = context.person;
          const time = context.meeting_time;

          if (person && time) {
            return { utterance: `A meeting with ${person}, ${time} has been created.` };
          } else if (person) {
            return { utterance: `Please tell me when to schedule the meeting with ${person}.` };
          } else if (time) {
            return { utterance: `Please tell me who to schedule the meeting with at ${time}.` };
          } else {
            return { utterance: "I need more information to create a meeting. Please tell me who and when to create a meeting!" };
          }
        },
      },
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