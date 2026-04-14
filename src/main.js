import {
  calcDimensionScores,
  scoresToLevels,
  determineResult,
} from "./engine.js";
import { createQuiz } from "./quiz.js";
import { renderResult } from "./result.js";
import "./style.css";

async function loadJSON(path) {
  const res = await fetch(path);
  return res.json();
}

async function init() {
  const [questions, dimensions, types, config] = await Promise.all([
    loadJSON(new URL("../data/questions.json", import.meta.url).href),
    loadJSON(new URL("../data/dimensions.json", import.meta.url).href),
    loadJSON(new URL("../data/types.json", import.meta.url).href),
    loadJSON(new URL("../data/config.json", import.meta.url).href),
  ]);

  const pages = {
    intro: document.getElementById("page-intro"),
    quiz: document.getElementById("page-quiz"),
    result: document.getElementById("page-result"),
  };

  function showPage(name) {
    Object.values(pages).forEach((p) => p.classList.remove("active"));
    pages[name].classList.add("active");
    window.scrollTo(0, 0);
  }

  function onQuizComplete(answers, isHotpot) {
    const scores = calcDimensionScores(answers, questions.main);
    const levels = scoresToLevels(scores, config.scoring.levelThresholds);
    const result = determineResult(
      levels,
      dimensions.order,
      types.standard,
      types.special,
      {
        isHotpot,
        maxDistance: config.scoring.maxDistance,
        fallbackThreshold: config.scoring.fallbackThreshold,
      },
    );
    renderResult(
      result,
      levels,
      scores,
      dimensions.order,
      dimensions.definitions,
      config,
    );
    showPage("result");
  }

  const quiz = createQuiz(questions, config, onQuizComplete);

  function cleanPersona() {
    document.body.removeAttribute("data-persona");
    document.body.style.removeProperty("--theme-c");
    document.body.style.removeProperty("--theme-d");
  }

  document.getElementById("btn-start").addEventListener("click", () => {
    cleanPersona();
    quiz.start();
    showPage("quiz");
  });

  document.getElementById("btn-restart").addEventListener("click", () => {
    cleanPersona();
    quiz.start();
    showPage("quiz");
  });
}

init();
