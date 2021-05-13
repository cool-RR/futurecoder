import {ipush, iremove, iset, redact} from "../frontendlib";
import {rpc} from "../rpc";
import {animateScroll, scroller} from "react-scroll";
import _ from "lodash";
import {terminalRef} from "../RunCode";

const initialState = {
  pages: {
    loading_placeholder: {
      title: "Loading...",
      slug: "loading_placeholder",
      index: 0,
      steps: [
        {
          index: 0,
          text: "",
          hints: [],
          name: "loading_placeholder",
          solution: null,
        }
      ],
    },
  },
  pageSlugsList: ["loading_placeholder"],
  user: {
    email: "",
    developerMode: false,
    pagesProgress: {
      loading_placeholder: {
        step_name: "loading_placeholder",
      }
    },
    pageSlug: "loading_placeholder",
  },
  processing: false,
  numHints: 0,
  editorContent: "",
  messages: [],
  pastMessages: [],
  requestingSolution: 0,
  prediction: {
    choices: null,
    answer: "",
    wrongAnswers: [],
    userChoice: "",
    state: "hidden",
    codeResult: {},
  },
};


const {reducer, makeAction, setState, localState, statePush} = redact('book', initialState, {dispatched: true});

export {reducer as bookReducer, setState as bookSetState, localState as bookState, statePush as bookStatePush};

const isLoaded = (state) => state.user.email.length && state.pageSlugsList.length > 1

export const currentPage = (state = localState) => {
  if (!isLoaded(state)) {
    return initialState.pages.loading_placeholder;
  }
  return state.pages[state.user.pageSlug];
};

const pageProgress = (state = localState) => {
  if (!isLoaded(state)) {
    return initialState.user.pagesProgress.loading_placeholder;
  }
  return state.user.pagesProgress[state.user.pageSlug];
};

export const currentStepName = (state = localState) => pageProgress(state).step_name;
export const currentStep = (state = localState) =>
  _.find(currentPage(state).steps, {name: currentStepName(state)});

export const setPage = (page_slug) => {
  setState("user.pageSlug", page_slug);
  afterSetPage(page_slug);
};

const afterSetPage = (page_slug, state = localState) => {
  scroller.scrollTo(`step-text-${currentStep(state).index}`, {delay: 0, duration: 0});
  rpc("set_page", {page_slug});
}

export const setPageIndex = (pageIndex) => {
  setPage(localState.pageSlugsList[pageIndex]);
};

export const movePage = (delta) => {
  setPageIndex(currentPage().index + delta);
};

export const moveStep = (delta) => {
  const stepIndex = currentStep().index + delta;
  const step = currentPage().steps[stepIndex];
  if (!step) {
    return;
  }
  setState(["user", "pagesProgress", localState.user.pageSlug, "step_name"], step.name);
  rpc("set_pages_progress",
    {
      pages_progress: localState.user.pagesProgress,
    },
  );
};

const redirectToLogin = () => {
  window.location = '/accounts/login/?next='
    + window.location.pathname
    + window.location.search;
}

const loadPages = makeAction(
  "LOAD_PAGES",
  (state, {value: {pages, pageSlugsList}}) => {
    return loadUserAndPages({
      ...state,
      pages,
      pageSlugsList,
    });
  },
)

const loadUser = makeAction(
  "LOAD_USER",
  (state, {value: user}) => {
    if (!user.email) {
      redirectToLogin();
    }
    return loadUserAndPages({
      ...state,
      user,
    });
  },
)

const loadUserAndPages = (state) => {
  if (!isLoaded(state)) {
    return state;
  }
  let {
    user: {pagesProgress, pageSlug},
    pages,
    pageSlugsList
  } = state;
  pageSlug = new URLSearchParams(window.location.search).get('page') || pageSlug;
  pagesProgress = _.fromPairs(
    pageSlugsList.map(slug =>
      [
        slug,
        pagesProgress[slug] || {step_name: pages[slug].steps[0].name}
      ]
    )
  )
  state = {...state, user: {...state.user, pagesProgress, pageSlug}};
  afterSetPage(pageSlug, state);
  return state;
}

const on403 = (response) => {
  if (response.status === 403) {
    redirectToLogin();
  }
};

rpc(
  "get_user",
  {},
  loadUser,
  on403,
);

rpc(
  "get_pages",
  {},
  loadPages,
  on403,
);

export const showHint = makeAction(
  'SHOW_HINT',
  (state) => {
    return {
      ...state,
      numHints: state.numHints + 1,
    };
  },
);

export const scrollToNextStep = () => {
  setTimeout(() =>
      scroller.scrollTo(`step-text-${currentStep().index}`, {
        duration: 1000,
        smooth: true,
      }),
    500,
  )
};

export const ranCode = makeAction(
  'RAN_CODE',
  (state, {value}) => {
    if (value.passed) {
      scrollToNextStep();

      state = {
        ...state,
        ..._.pick(initialState,
          "numHints messages requestingSolution".split(" ")),
        prediction: {
          ...value.prediction,
          userChoice: "",
          wrongAnswers: [],
          state: value.prediction.choices ? "waiting" : "hidden",
          codeResult: value,
        },
        processing: false,
      };
    }
    for (const message of value.messages) {
      state = addMessageToState(state, message);
    }

    if (value.prediction.choices) {
      const scrollInterval = setInterval(() => {
        animateScroll.scrollToBottom({duration: 30, container: terminalRef.current.terminalRoot.current});
      }, 30);
      setTimeout(() => clearInterval(scrollInterval), 1300);
    }
    return state;
  },
);

const addMessageToState = (state, message) => {
  if (message && state.pastMessages.indexOf(message) === -1) {
      animateScroll.scrollToBottom({duration: 1000, delay: 500});
      state = ipush(state, "messages", message);
      state = ipush(state, "pastMessages", message);
    }
  return state;
}

export const addMessage = makeAction(
  'ADD_MESSAGE',
  (state, {value}) => addMessageToState(state, value)
)

export const closeMessage = makeAction(
  'CLOSE_MESSAGE',
  (state, {value}) => iremove(state, "messages", value)
)

export const revealSolutionToken = makeAction(
  "REVEAL_SOLUTION_TOKEN",
  (state) => {
    const solution_path = ["pages", state.user.pageSlug, "steps", currentStep(state).index, "solution"];
    const indices_path = [...solution_path, "maskedIndices"]
    const indices = _.get(state, indices_path);
    if (!indices.length) {
      return state;
    }
    state = iremove(state, indices_path, 0);
    state = iset(state, [...solution_path, "mask", indices[0]], false);
    return state;
  }
)

export const setDeveloperMode = (value) => {
  rpc("set_developer_mode", {value});
  setState("user.developerMode", value);
}

export const reorderSolutionLines = makeAction(
  "REORDER_SOLUTION_LINES",
  (state, {startIndex, endIndex}) => {
    const path = ["pages", state.user.pageSlug, "steps", currentStep(state).index, "solution", "lines"];
    const result = Array.from(_.get(state, path));
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return iset(state, path, result);
  },
  (startIndex, endIndex) => ({startIndex, endIndex})
)
