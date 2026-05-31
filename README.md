# History Quest 🦅

A fun, kid-friendly study game for U.S. History (Units 4–7): Forming a New Nation,
Launching the New Republic, An Expanding Nation, and Americans in the Mid-1800s.

Built for a 10-year-old to make studying feel like a game — points, streaks,
hearts, confetti, sound effects, badges, and flashcards.

## Play

Live site: **https://nicoturbay.github.io/kids-study/**

## Modes

- **🎮 Quiz** — multiple-choice questions with points, a streak bonus, 3 hearts,
  star ratings, and badges.
- **🃏 Flashcards** — flip cards to study questions and answers at your own pace.
- **👑 Boss Mode** — a shuffled mix of every question from all units.

## Run locally

It's plain HTML/CSS/JS — no build step. Just open `index.html`, or:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Editing the questions

All study content lives in `data.js`. Each question has the original answer
(used for flashcards) plus a short correct choice and three distractors for the quiz.
