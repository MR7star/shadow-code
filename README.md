# Shadow Code — Level Up Your Coding Skills

**Turn programming into an RPG. Complete coding quests, earn XP, develop your skills, and rise through the hunter ranks.**

Shadow Code is a gamified programming-learning platform inspired by the progression system of *Solo Leveling*. It transforms traditional coding practice into an interactive RPG experience where every challenge is a mission, every successful submission contributes to progression, and every milestone brings you closer to becoming a stronger programmer.

Instead of simply solving coding problems, players build their programming abilities through quests, dungeons, competitive challenges, and a progression-based learning system.

---

## Features

### 1. RPG Progression System
- XP-based progression and leveling.
- Hunter ranks and promotion trials.
- Character attributes and skill development.
- Achievements, titles, and progression milestones.
- Daily quests and streak tracking.

### 2. Quest System
- Main and daily coding missions.
- Difficulty-based challenges.
- Quest prerequisites and unlocking.
- Quest acceptance and completion workflows.
- XP rewards and reward claiming.
- Search, filtering, and sorting.
- Detailed quest objectives and progress tracking.

### 3. Adaptive Learning
- Concept mastery tracking.
- Skill-level progression.
- Adaptive quest difficulty.
- Prerequisite-based learning progression.
- Personalized learning challenges based on player mastery.

### 4. Dungeons and Boss Challenges
- Dungeon-based coding experiences.
- Challenge progression.
- Boss encounters.
- Entry requirements and rewards.

### 5. Ranked Arena
- Competitive coding matches.
- Matchmaking and timed challenges.
- Python code submissions.
- Hidden test evaluation.
- Elo-based ranking.
- Match history and competitive progression.

### 6. Tournaments and Spectator Mode
- Tournament registration.
- Bracket-based competitions.
- Tournament match progression.
- Live match information.
- Spectator views with sanitized match information.

### 7. Guilds and Social Progression
- Guild-related functionality.
- Seasonal progression.
- Leaderboards.
- Competitive community features.

### 8. Shadow Code Design System (SCDS)
- Centralized design tokens.
- Reusable UI components.
- Consistent buttons, panels, badges, and progress indicators.
- Responsive layouts.
- Dark fantasy RPG and esports-inspired visual direction.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript |
| Build Tool | Vite |
| Backend | Node.js |
| Database | SQLite (`node:sqlite`) |
| Styling | CSS, centralized design tokens |
| Icons | Lucide React |
| Programming Challenges | Python execution through a backend runner |
| Testing | Project-specific automated test suites |

---

## Project Structure

```text
Shadow-Code/
│
├── src/
│   ├── components/
│   │   ├── layout/
│   │   └── ui/
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── QuestBoard.tsx
│   │   ├── QuestSolver.tsx
│   │   ├── Dungeons.tsx
│   │   ├── Arena/
│   │   └── Tournaments.tsx
│   │
│   ├── services/
│   ├── data/
│   ├── styles/
│   └── App.tsx
│
├── server/
│   ├── runner.mjs
│   ├── challenges.mjs
│   └── db.mjs
│
├── tests/
│   ├── helpers/
│   └── backend_*.test.mjs
│
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

*The structure above is representative; individual filenames and folders may evolve as development continues.*

---

## Getting Started

### Prerequisites

- Node.js version compatible with the project's dependencies.
- npm.
- Git.
- Python installed if required by the coding challenge execution environment.

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Shadow-Code.git
cd Shadow-Code
```

Replace `YOUR_USERNAME` with your GitHub username and adjust the repository URL if necessary.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Check the project's environment configuration and `.env.example`, if present.

Create a local `.env` file if required.

Do not commit secrets, credentials, or private configuration values.

### 4. Start the application

Use the development scripts defined in `package.json`.

For example, if the project has separate frontend and backend scripts, start them in separate terminals.

### 5. Open the application

Open the local URL printed by Vite in your terminal.

---

## Testing and Validation

Run the following commands:

**TypeScript validation**

```bash
npx tsc --noEmit
```

**Production build**

```bash
npm run build
```

**Complete automated test suite**

```bash
npm run test:all
```

The backend test infrastructure supports dynamically assigned ports to reduce conflicts between independent test runs.

---

## Design Philosophy

Shadow Code combines two visual directions:

- **Dark Fantasy RPG:** Deep backgrounds, arcane purple accents, glowing effects, rank progression, and immersive mission interfaces.
- **Professional Esports:** Clear information hierarchy, readable statistics, competitive interfaces, responsive layouts, and consistent interaction patterns.

The goal is to make coding practice feel like character progression without sacrificing usability.

---

## Project Roadmap

| Phase | Focus |
|---|---|
| Phase 1 | Core RPG progression and learning systems |
| Phase 2 | Shared Shadow Code Design System |
| Phase 3 | Quest Board redesign |
| Phase 4 | Dungeons redesign |
| Phase 5 | Arena and tournament experience improvements |
| Phase 6 | Further adaptive learning and progression enhancements |

Development is ongoing. Features and interfaces may evolve between releases.

---

## Security Considerations

Shadow Code executes programming submissions through a backend runner.

Python-level import restrictions alone are not sufficient to safely execute arbitrary untrusted code in a public environment.

Before accepting public submissions, the execution infrastructure should use appropriate operating-system or container-level isolation, resource limits, filesystem restrictions, network restrictions, and process controls.

Do not expose an unrestricted code execution service to the public.

---

## Contributing

Contributions, suggestions, and bug reports are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement your changes.
4. Run the relevant tests.
5. Submit a pull request with a clear description.

Keep changes focused and preserve existing progression, quest, and reward logic unless the change explicitly targets those systems.

---

## Project Status

**Shadow Code is an actively developed project.**

The core RPG progression, quest system, adaptive learning, competitive arena, tournament functionality, and shared design-system foundation are part of the ongoing development.

---

*Train. Complete quests. Gain XP. Evolve. Rise through the ranks.*

**Welcome to Shadow Code.**