const fs = require("fs");
const path = require("path");

const QUESTION_BANK_FILE = path.join(__dirname, "question-bank.json");

function normalizeQuestion(question, index, bankName) {
  const label = `${bankName}[${index}]`;
  if (!question || typeof question.prompt !== "string" || !question.prompt.trim()) {
    throw new Error(`Invalid question prompt in ${label}`);
  }
  if (!Array.isArray(question.options) || question.options.length < 2) {
    throw new Error(`Invalid options in ${label}`);
  }
  if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) {
    throw new Error(`Invalid answer index in ${label}`);
  }

  return {
    prompt: question.prompt.trim(),
    options: question.options.map((option) => String(option)),
    answer: question.answer,
    explanation: String(question.explanation || "")
  };
}

function loadQuestionBank() {
  const bank = JSON.parse(fs.readFileSync(QUESTION_BANK_FILE, "utf8"));
  const standard = Array.isArray(bank.standard)
    ? bank.standard.map((question, index) => normalizeQuestion(question, index, "standard"))
    : [];
  const challenge = Array.isArray(bank.challenge)
    ? bank.challenge.map((question, index) => normalizeQuestion(question, index, "challenge"))
    : [];

  if (!standard.length) {
    throw new Error("Question bank needs at least one standard question");
  }

  return { standard, challenge };
}

module.exports = {
  QUESTION_BANK_FILE,
  loadQuestionBank
};
