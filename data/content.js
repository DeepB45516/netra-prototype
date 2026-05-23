const { loadQuestionBank } = require("./questions");

const pathConfigs = [
  {
    id: "grades-6-8",
    title: "Grades 6-8",
    label: "Beginner",
    audience: "Middle school students",
    lessons: 8,
    levelsPerLesson: 5,
    sectionsPerLevel: 5,
    questionsPerSection: 8,
    scenariosPerLesson: 2,
    accent: "#18a999",
    topics: [
      "Password Power",
      "Spotting Phishing",
      "Safe Chat and Gaming",
      "Device Lockdown",
      "Privacy Basics",
      "Download Decisions",
      "Kindness and Reporting",
      "Cyber Ready Review"
    ]
  },
  {
    id: "grades-9-10",
    title: "Grades 9-10",
    label: "Intermediate",
    audience: "High school students",
    lessons: 10,
    levelsPerLesson: 5,
    sectionsPerLevel: 5,
    questionsPerSection: 10,
    scenariosPerLesson: 3,
    accent: "#f5b700",
    topics: [
      "Identity and Accounts",
      "Social Engineering",
      "Mobile Security",
      "Cloud File Safety",
      "Browser and Link Checks",
      "Financial Scams",
      "Data Footprints",
      "Incident Response",
      "School Network Safety",
      "Readiness Challenge"
    ]
  },
  {
    id: "grades-11-12",
    title: "Grades 11-12",
    label: "Advanced",
    audience: "Older students",
    lessons: 12,
    levelsPerLesson: 5,
    sectionsPerLevel: 5,
    questionsPerSection: 12,
    scenariosPerLesson: 4,
    accent: "#ef476f",
    topics: [
      "Threat Modeling",
      "Account Recovery",
      "Phishing Investigation",
      "Privacy Law Basics",
      "Secure Collaboration",
      "AI Scam Detection",
      "Payment and Marketplace Safety",
      "Home Network Hygiene",
      "Digital Reputation",
      "Breach Response",
      "Career Readiness",
      "Capstone Defense"
    ]
  },
  {
    id: "adults-parents",
    title: "Adults / Parents",
    label: "Family Defender",
    audience: "Parents and caregivers",
    lessons: 10,
    levelsPerLesson: 5,
    sectionsPerLevel: 5,
    questionsPerSection: 10,
    scenariosPerLesson: 4,
    accent: "#4d96ff",
    topics: [
      "Family Account Safety",
      "Parenting Around Devices",
      "Scams and Payments",
      "School App Privacy",
      "Household Network Safety",
      "Identity Theft Prevention",
      "Conversation Playbooks",
      "Crisis Response",
      "Travel and Public Wi-Fi",
      "Family Certification"
    ]
  }
];

const levelNames = ["Learn", "Practice", "Mission", "Review", "Challenge"];

const conceptTemplates = [
  "Look for pressure, unusual requests, and mismatched sender details before taking action.",
  "Use a separate trusted channel when a message asks for money, passwords, codes, or urgent help.",
  "Keep accounts safer with strong unique passwords, passkeys where available, and multi-factor authentication.",
  "Share less personal information than a form, game, quiz, or stranger asks for.",
  "Update devices and apps so known security problems get fixed before attackers can use them.",
  "Report suspicious activity quickly so a trusted adult, school, bank, or platform can help."
];

const scenarioTemplates = [
  {
    title: "Prize Message",
    setup: "A direct message claims you won a new phone. It asks you to sign in through a short link and pay a small shipping fee within 15 minutes.",
    choices: [
      {
        id: "a",
        text: "Use the link and pay quickly before the offer expires",
        safe: false,
        feedback: "The urgency, short link, and fee are scam signals. Do not enter payment details."
      },
      {
        id: "b",
        text: "Search for the official giveaway page and verify before doing anything",
        safe: true,
        feedback: "Good move. Independent verification protects you from fake landing pages."
      },
      {
        id: "c",
        text: "Reply with your school email so they can confirm your identity",
        safe: false,
        feedback: "Sharing more personal data gives the scammer more to work with."
      }
    ]
  },
  {
    title: "Account Alert",
    setup: "An email says your streaming account was used in another country. The sender address has extra letters and the button goes to an unfamiliar website.",
    choices: [
      {
        id: "a",
        text: "Open the streaming app directly and check account activity",
        safe: true,
        feedback: "Correct. Going directly to the known app avoids the fake button."
      },
      {
        id: "b",
        text: "Click the email button because the alert might be urgent",
        safe: false,
        feedback: "Fake alerts use urgency to push clicks. Verify through the official service."
      },
      {
        id: "c",
        text: "Forward the email to your contacts to ask if they received it",
        safe: false,
        feedback: "Forwarding suspicious links can spread the risk."
      }
    ]
  },
  {
    title: "Game Mod Download",
    setup: "A video promises a free game mod, but the installer asks you to disable antivirus and sign in with your gaming account.",
    choices: [
      {
        id: "a",
        text: "Stop the installation and look for official or community-verified sources",
        safe: true,
        feedback: "Smart. Disabling protections and asking for credentials are major warning signs."
      },
      {
        id: "b",
        text: "Disable antivirus just while installing",
        safe: false,
        feedback: "That removes a safety layer exactly when you need it most."
      },
      {
        id: "c",
        text: "Use your gaming login because mods need account access",
        safe: false,
        feedback: "A mod installer should not need your account password."
      }
    ]
  },
  {
    title: "Family Payment Scam",
    setup: "A text says, 'Mom, I broke my phone. Please send money to this wallet now.' The number is unfamiliar and the sender says not to call.",
    choices: [
      {
        id: "a",
        text: "Send the money because family emergencies must be fast",
        safe: false,
        feedback: "Scammers rely on panic. Verify first."
      },
      {
        id: "b",
        text: "Call the known number for that family member or another trusted contact",
        safe: true,
        feedback: "Exactly. Use a trusted channel before sending money."
      },
      {
        id: "c",
        text: "Reply with personal details to prove who you are",
        safe: false,
        feedback: "That gives the scammer more information."
      }
    ]
  }
];

function getPath(pathId) {
  return pathConfigs.find((pathConfig) => pathConfig.id === pathId) || pathConfigs[0];
}

function buildCurriculum(pathId) {
  const pathConfig = getPath(pathId);
  return Array.from({ length: pathConfig.lessons }, (_, lessonIndex) => {
    const lessonNumber = lessonIndex + 1;
    const topic = pathConfig.topics[lessonIndex] || `Cyber Lesson ${lessonNumber}`;
    return {
      id: `lesson-${lessonNumber}`,
      number: lessonNumber,
      title: topic,
      summary: conceptTemplates[lessonIndex % conceptTemplates.length],
      levels: Array.from({ length: pathConfig.levelsPerLesson }, (_, levelIndex) => ({
        id: `level-${levelIndex + 1}`,
        number: levelIndex + 1,
        title: `${levelNames[levelIndex] || "Level"} ${levelIndex + 1}`,
        sections: Array.from({ length: pathConfig.sectionsPerLevel }, (_, sectionIndex) => ({
          id: `section-${sectionIndex + 1}`,
          number: sectionIndex + 1,
          title: `Section ${sectionIndex + 1}`,
          targetQuestions: pathConfig.questionsPerSection
        }))
      })),
      scenarioCount: pathConfig.scenariosPerLesson
    };
  });
}

function chooseBank(difficulty) {
  const { standard, challenge } = loadQuestionBank();

  if (difficulty === "challenge") {
    return standard.concat(challenge);
  }

  if (difficulty === "support") {
    return standard.slice(0, Math.min(8, standard.length));
  }

  return standard;
}

function makeQuestion(template, index, topic, levelNumber, sectionNumber, difficulty) {
  return {
    id: `q-${levelNumber}-${sectionNumber}-${index + 1}`,
    prompt: `${template.prompt}`,
    topic,
    difficulty,
    options: [...template.options],
    answer: template.answer,
    explanation: `${template.explanation} Topic focus: ${topic}.`
  };
}

function generateQuestions({ pathId, lessonId, levelId, sectionId = "section-1", accuracy = 0.75 }) {
  const pathConfig = getPath(pathId);
  const lessonNumber = Number(String(lessonId).replace("lesson-", "")) || 1;
  const levelNumber = Number(String(levelId).replace("level-", "")) || 1;
  const sectionNumber = Number(String(sectionId).replace("section-", "")) || 1;
  const topic = pathConfig.topics[lessonNumber - 1] || "Cyber Safety";
  const difficulty = accuracy >= 0.85 ? "challenge" : accuracy < 0.55 ? "support" : "standard";
  const bank = chooseBank(difficulty);

  return Array.from({ length: pathConfig.questionsPerSection }, (_, index) => {
    const template = bank[(lessonNumber + levelNumber + sectionNumber + index) % bank.length];
    return makeQuestion(template, index, topic, levelNumber, sectionNumber, difficulty);
  });
}

function generateScenario({ pathId, lessonId, scenarioIndex = 0 }) {
  const pathConfig = getPath(pathId);
  const lessonNumber = Number(String(lessonId).replace("lesson-", "")) || 1;
  const topic = pathConfig.topics[lessonNumber - 1] || "Cyber Safety";
  const base = scenarioTemplates[(lessonNumber + scenarioIndex) % scenarioTemplates.length];

  return {
    id: `${lessonId}-scenario-${scenarioIndex + 1}`,
    title: `${base.title}: ${topic}`,
    setup: base.setup,
    topic,
    choices: base.choices
  };
}

function getAllPaths() {
  return pathConfigs;
}

module.exports = {
  buildCurriculum,
  generateQuestions,
  generateScenario,
  getAllPaths,
  getPath
};
