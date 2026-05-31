(function () {
  "use strict";

  // ---------- state ----------
  var state = {
    mode: "quiz",        // "quiz" | "flash"
    unit: null,          // unit object (or synthetic "all")
    deck: [],            // questions for this round
    index: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    lives: 3,
    correctCount: 0,
    answered: false,
    flashFlipped: false,
  };

  var MAX_LIVES = 3;
  var QUIZ_LEN = 10; // questions per quiz round (or fewer if unit is small)

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function show(screenId) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove("active");
    $(screenId).classList.add("active");
    window.scrollTo(0, 0);
  }

  // ---------- persistence ----------
  function bestKey(unitId) { return "histquest_best_" + unitId; }
  function getBest(unitId) {
    var v = localStorage.getItem(bestKey(unitId));
    return v ? JSON.parse(v) : null;
  }
  function saveBest(unitId, pct, points) {
    var prev = getBest(unitId);
    if (!prev || pct > prev.pct || (pct === prev.pct && points > prev.points)) {
      localStorage.setItem(bestKey(unitId), JSON.stringify({ pct: pct, points: points }));
    }
  }

  // ---------- sound (Web Audio, no asset files) ----------
  var audioCtx = null;
  var soundOn = localStorage.getItem("histquest_sound") !== "off";
  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
    return audioCtx;
  }
  function tone(freq, start, dur, type, gain) {
    var ctx = ac();
    if (!ctx || !soundOn) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, ctx.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.02);
  }
  function sndCorrect() { tone(660, 0, 0.12, "triangle", 0.25); tone(990, 0.1, 0.18, "triangle", 0.25); }
  function sndWrong() { tone(200, 0, 0.18, "sawtooth", 0.18); tone(150, 0.12, 0.22, "sawtooth", 0.18); }
  function sndWin() {
    var notes = [523, 659, 784, 1046];
    for (var i = 0; i < notes.length; i++) tone(notes[i], i * 0.12, 0.2, "triangle", 0.25);
  }
  function sndClick() { tone(440, 0, 0.05, "square", 0.12); }

  // ---------- confetti ----------
  var canvas = $("confetti");
  var cctx = canvas.getContext("2d");
  var pieces = [];
  function sizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  sizeCanvas();
  window.addEventListener("resize", sizeCanvas);
  var COLORS = ["#ffce3a", "#ff6b6b", "#4ec5a4", "#5b8def", "#b14bff", "#ff9b3d"];
  function burst(amount, fromTop) {
    for (var i = 0; i < amount; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: fromTop ? -20 : canvas.height * 0.35 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * -7 - 3,
        size: 6 + Math.random() * 8,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
        life: 90 + Math.random() * 40,
      });
    }
    if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
  }
  var rafOn = false;
  function tick() {
    cctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = pieces.length - 1; i >= 0; i--) {
      var p = pieces[i];
      p.vy += 0.18; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rot);
      cctx.fillStyle = p.color;
      cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      cctx.restore();
      if (p.life <= 0 || p.y > canvas.height + 40) pieces.splice(i, 1);
    }
    if (pieces.length > 0) requestAnimationFrame(tick);
    else { rafOn = false; cctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  // ---------- home ----------
  function renderHome() {
    var grid = $("unit-grid");
    grid.innerHTML = "";
    UNITS.forEach(function (u) {
      var best = getBest(u.id);
      var btn = document.createElement("button");
      btn.className = "unit-card";
      btn.style.background = "linear-gradient(150deg, " + u.color + ", " + shade(u.color, -25) + ")";
      btn.innerHTML =
        '<span class="u-emoji">' + u.emoji + "</span>" +
        '<span class="u-sub">' + u.subtitle + "</span>" +
        '<span class="u-title">' + u.title + "</span>" +
        '<span class="u-meta">' + u.questions.length + " questions</span>" +
        (best ? '<span class="u-best">🏆 ' + best.pct + "%</span>" : "");
      btn.addEventListener("click", function () { sndClick(); startRound(u); });
      grid.appendChild(btn);
    });

    // Boss mode = all units
    var boss = document.createElement("button");
    boss.className = "unit-card boss";
    var allBest = getBest("all");
    boss.innerHTML =
      '<span class="u-emoji">👑</span>' +
      '<span class="u-title">Boss Mode: All Units</span>' +
      '<span class="u-meta">A surprise mix of every question</span>' +
      (allBest ? '<span class="u-best">🏆 ' + allBest.pct + "%</span>" : "");
    boss.addEventListener("click", function () {
      sndClick();
      var all = [];
      UNITS.forEach(function (u) {
        u.questions.forEach(function (q) {
          var c = Object.assign({}, q); c._unit = u; all.push(c);
        });
      });
      startRound({ id: "all", title: "Boss Mode", subtitle: "All Units", emoji: "👑", color: "#b14bff", questions: all });
    });
    grid.appendChild(boss);
  }

  function shade(hex, percent) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + Math.round(255 * percent / 100)));
    g = Math.max(0, Math.min(255, g + Math.round(255 * percent / 100)));
    b = Math.max(0, Math.min(255, b + Math.round(255 * percent / 100)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ---------- start round ----------
  function startRound(unit) {
    state.unit = unit;
    if (state.mode === "feed") { startFeed(unit); return; }
    if (state.mode === "flash") { startFlash(unit); return; }
    state.deck = shuffle(unit.questions).slice(0, Math.min(QUIZ_LEN, unit.questions.length));
    state.index = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.lives = MAX_LIVES;
    state.correctCount = 0;
    show("quiz");
    renderQuestion();
  }

  // ---------- quiz ----------
  function renderQuestion() {
    state.answered = false;
    var q = state.deck[state.index];
    var unitForChip = q._unit || state.unit;
    $("quiz-unit-chip").textContent = unitForChip.emoji + " " + unitForChip.title;

    $("question").textContent = q.q;
    $("score").textContent = state.score;
    $("streak").textContent = "🔥 " + state.streak;
    renderLives();

    var total = state.deck.length;
    $("progress").style.width = ((state.index) / total) * 100 + "%";
    $("progress-text").textContent = (state.index + 1) + " / " + total;

    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    $("next-btn").classList.add("hidden");

    var options = shuffle([q.correct].concat(q.wrong));
    var letters = ["A", "B", "C", "D"];
    var wrap = $("answers");
    wrap.innerHTML = "";
    options.forEach(function (opt, i) {
      var b = document.createElement("button");
      b.className = "answer-btn";
      b.innerHTML = '<span class="pick">' + letters[i] + "</span><span>" + opt + "</span>";
      b.addEventListener("click", function () { onAnswer(b, opt, q); });
      wrap.appendChild(b);
    });
  }

  function renderLives() {
    var s = "";
    for (var i = 0; i < MAX_LIVES; i++) s += i < state.lives ? "❤️" : "🤍";
    $("lives").textContent = s;
  }

  function onAnswer(btn, opt, q) {
    if (state.answered) return;
    state.answered = true;
    var buttons = $("answers").querySelectorAll(".answer-btn");
    var isRight = opt === q.correct;

    buttons.forEach(function (b) {
      b.disabled = true;
      var label = b.querySelector("span:last-child").textContent;
      if (label === q.correct) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    });

    if (isRight) {
      state.correctCount++;
      state.streak++;
      if (state.streak > state.bestStreak) state.bestStreak = state.streak;
      var bonus = Math.min(state.streak, 5) * 2;
      var gained = 10 + bonus;
      state.score += gained;
      $("score").textContent = state.score;
      $("streak").textContent = "🔥 " + state.streak;
      var fb = $("feedback");
      fb.className = "feedback good";
      fb.textContent = state.streak >= 3 ? cheer() + " +" + gained + " (🔥" + state.streak + " streak!)" : cheer() + " +" + gained;
      sndCorrect();
      burst(state.streak >= 3 ? 60 : 28, true);
    } else {
      state.streak = 0;
      state.lives--;
      renderLives();
      $("streak").textContent = "🔥 0";
      var fbx = $("feedback");
      fbx.className = "feedback bad";
      fbx.textContent = "Oops! The answer is: " + q.correct;
      sndWrong();
      $("quiz").classList.add("shake");
      setTimeout(function () { $("quiz").classList.remove("shake"); }, 420);
    }

    var nb = $("next-btn");
    nb.classList.remove("hidden");
    nb.textContent = (state.index === state.deck.length - 1) ? "See Results 🏁" : "Next ➡️";

    if (state.lives <= 0) {
      nb.textContent = "See Results 🏁";
    }
  }

  function cheer() {
    var c = ["Awesome!", "Nailed it!", "Yes!", "Correct!", "Great!", "Boom!", "Smart!", "You got it!"];
    return c[(Math.random() * c.length) | 0];
  }

  function nextQuestion() {
    if (state.lives <= 0 || state.index === state.deck.length - 1) { finishQuiz(); return; }
    state.index++;
    renderQuestion();
  }

  // ---------- results ----------
  function finishQuiz() {
    var total = state.deck.length;
    var pct = Math.round((state.correctCount / total) * 100);
    saveBest(state.unit.id, pct, state.score);

    show("results");
    $("result-correct").textContent = state.correctCount;
    $("result-total").textContent = total;
    $("result-points").textContent = state.score;

    var stars = pct >= 90 ? 3 : pct >= 60 ? 2 : pct >= 30 ? 1 : 0;
    var starWrap = $("result-stars");
    starWrap.innerHTML = "";
    for (var i = 0; i < 3; i++) {
      var s = document.createElement("span");
      s.className = "star-pop";
      s.style.animationDelay = (i * 0.18) + "s";
      s.textContent = i < stars ? "⭐" : "☆";
      starWrap.appendChild(s);
    }

    var lostAll = state.lives <= 0;
    var title, emoji, msg;
    if (lostAll && pct < 100) {
      emoji = "💪"; title = "Out of hearts!"; msg = "So close — give it another try, hero!";
    } else if (pct === 100) {
      emoji = "🏆"; title = "PERFECT!"; msg = "A flawless run. You're a true History Hero!";
    } else if (pct >= 70) {
      emoji = "🎉"; title = "Awesome job!"; msg = "You really know your history!";
    } else if (pct >= 40) {
      emoji = "👍"; title = "Nice work!"; msg = "Keep practicing and you'll be a pro!";
    } else {
      emoji = "🌱"; title = "Good start!"; msg = "Every hero starts somewhere. Try again!";
    }
    $("result-emoji").textContent = emoji;
    $("result-title").textContent = title;
    $("result-msg").textContent = msg;

    var badge = "";
    if (pct === 100) badge = "🏅 Badge earned: " + state.unit.title + " Master!";
    else if (state.bestStreak >= 5) badge = "🔥 Badge earned: Streak Star (" + state.bestStreak + " in a row)!";
    else if (pct >= 70) badge = "⭐ Badge earned: History Whiz!";
    $("result-badge").textContent = badge;

    if (pct >= 70) { sndWin(); burst(140, true); setTimeout(function () { burst(80, true); }, 400); }
  }

  // ---------- flashcards ----------
  function startFlash(unit) {
    state.deck = shuffle(unit.questions);
    state.index = 0;
    state.flashFlipped = false;
    $("flash-unit-chip").textContent = unit.emoji + " " + unit.title;
    show("flash");
    renderFlash();
  }
  function renderFlash() {
    var q = state.deck[state.index];
    $("flash-inner").classList.remove("flipped");
    state.flashFlipped = false;
    setTimeout(function () {
      $("flash-q").textContent = q.q;
      $("flash-a").textContent = q.a;
    }, state.flashFlipped ? 250 : 0);
    $("flash-q").textContent = q.q;
    $("flash-a").textContent = q.a;
    $("flash-count").textContent = (state.index + 1) + " / " + state.deck.length;
  }
  function flipFlash() {
    state.flashFlipped = !state.flashFlipped;
    $("flash-inner").classList.toggle("flipped", state.flashFlipped);
    sndClick();
  }
  function flashStep(dir) {
    state.index = (state.index + dir + state.deck.length) % state.deck.length;
    renderFlash();
    sndClick();
  }

  // ---------- FEED (TikTok-style vertical activities) ----------
  var feed = null;
  var FEED_FORMATS = ["mc", "tf", "thisorthat", "reveal"];

  function startFeed(unit) {
    state.unit = unit;
    var qs = unit.questions.map(function (q) {
      var c = Object.assign({}, q);
      c._unit = q._unit || unit;
      return c;
    });
    if (feed && feed.observer) feed.observer.disconnect();
    feed = {
      unit: unit,
      qs: qs,
      total: qs.length,
      remaining: new Set(qs.map(function (_, i) { return i; })),
      liveIds: new Set(),
      cards: [],
      lastId: -1,
      lastFormat: null,
      finished: false,
      celebrated: false,
    };
    var scroll = $("feed-scroll");
    scroll.innerHTML = "";
    scroll.scrollTop = 0;
    $("swipe-hint").classList.remove("gone");
    feed.observer = new IntersectionObserver(onFeedIntersect, { root: scroll, threshold: 0.6 });
    show("feed");
    updateFeedProgress();
    feedAppend();
    feedAppend();
  }

  function exitFeed() {
    if (feed && feed.observer) feed.observer.disconnect();
    feed = null;
    show("home");
    renderHome();
  }

  function updateFeedProgress() {
    var mastered = feed.total - feed.remaining.size;
    $("feed-progress").style.width = (mastered / feed.total) * 100 + "%";
    $("feed-progress-text").textContent = mastered + "/" + feed.total;
  }

  function feedPick() {
    if (feed.remaining.size === 0) return "finish";
    var arr = [];
    feed.remaining.forEach(function (id) { if (!feed.liveIds.has(id)) arr.push(id); });
    if (arr.length === 0) return "wait";
    var filtered = arr.length > 1 ? arr.filter(function (id) { return id !== feed.lastId; }) : arr;
    if (filtered.length === 0) filtered = arr;
    return filtered[(Math.random() * filtered.length) | 0];
  }

  function pickFormat() {
    var opts = FEED_FORMATS.filter(function (f) { return f !== feed.lastFormat; });
    return opts[(Math.random() * opts.length) | 0];
  }

  function feedAppend() {
    if (!feed || feed.finished) return;
    var pick = feedPick();
    if (pick === "wait") return;
    if (pick === "finish") { appendFinishCard(); return; }
    var fmt = pickFormat();
    feed.liveIds.add(pick);
    feed.lastId = pick;
    feed.lastFormat = fmt;
    var meta = { idx: pick, fmt: fmt, answered: false, live: true, isFinish: false };
    meta.el = buildFeedCard(meta);
    feed.cards.push(meta);
    $("feed-scroll").appendChild(meta.el);
    feed.observer.observe(meta.el);
  }

  function onFeedIntersect(entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting || e.intersectionRatio < 0.6) return;
      var meta = null;
      for (var i = 0; i < feed.cards.length; i++) {
        if (feed.cards[i].el === e.target) { meta = feed.cards[i]; break; }
      }
      if (!meta) return;
      var index = feed.cards.indexOf(meta);

      // hide the swipe hint once they move past the first card
      if (index >= 1) $("swipe-hint").classList.add("gone");

      // mark earlier unanswered cards as skipped (freed so they can return)
      for (var j = 0; j < index; j++) {
        var m = feed.cards[j];
        if (!m.isFinish && !m.answered && m.live) {
          m.live = false;
          feed.liveIds.delete(m.idx);
        }
      }

      if (meta.isFinish) { celebrateFinish(); return; }

      // keep one card of lookahead so there is always somewhere to scroll
      if (index === feed.cards.length - 1) feedAppend();
    });
  }

  function scrollToNext(meta) {
    var i = feed.cards.indexOf(meta);
    if (i > -1 && feed.cards[i + 1]) {
      feed.cards[i + 1].el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // mastered=true => learned (removed). mastered=false => stays and returns later.
  function feedResolve(meta, mastered) {
    if (meta.answered) return;
    meta.answered = true;
    feed.liveIds.delete(meta.idx);
    if (mastered) {
      feed.remaining.delete(meta.idx);
      updateFeedProgress();
      sndCorrect();
      burst(40, true);
    } else {
      sndWrong();
    }
    // make sure there is a next card to land on
    if (feed.cards.indexOf(meta) === feed.cards.length - 1) feedAppend();
  }

  function buildFeedCard(meta) {
    var q = feed.qs[meta.idx];
    var el = document.createElement("section");
    el.className = "feed-card fmt-" + meta.fmt;
    var inner = document.createElement("div");
    inner.className = "feed-inner";
    el.appendChild(inner);

    if (feed.unit.id === "all" && q._unit) {
      var chip = document.createElement("span");
      chip.className = "feed-unit-chip";
      chip.textContent = q._unit.emoji + " " + q._unit.subtitle;
      el.appendChild(chip);
    }

    if (meta.fmt === "mc") buildMC(inner, meta, q);
    else if (meta.fmt === "tf") buildTF(inner, meta, q);
    else if (meta.fmt === "thisorthat") buildToT(inner, meta, q);
    else buildReveal(inner, meta, q);

    // skip button (scroll past without answering)
    var skip = document.createElement("button");
    skip.className = "skip-btn";
    skip.textContent = "Skip for now ⏭";
    skip.addEventListener("click", function () { scrollToNext(meta); });
    el.appendChild(skip);
    return el;
  }

  function feedbackEl(parent) {
    var f = document.createElement("div");
    f.className = "feed-feedback";
    parent.appendChild(f);
    return f;
  }
  function nextHint(parent, txt) {
    var h = document.createElement("div");
    h.className = "feed-next-hint";
    h.textContent = txt || "Swipe up to keep going ⬆️";
    parent.appendChild(h);
  }

  // --- Format: Multiple choice ---
  function buildMC(inner, meta, q) {
    inner.innerHTML = '<span class="fmt-tag">🎯 Quick Pick</span><p class="feed-q"></p><div class="feed-answers"></div>';
    inner.querySelector(".feed-q").textContent = q.q;
    var wrap = inner.querySelector(".feed-answers");
    var fb = feedbackEl(inner);
    var opts = shuffle([q.correct].concat(q.wrong));
    opts.forEach(function (opt) {
      var b = document.createElement("button");
      b.className = "feed-opt";
      b.textContent = opt;
      b.addEventListener("click", function () {
        if (meta.answered) return;
        var right = opt === q.correct;
        wrap.querySelectorAll(".feed-opt").forEach(function (x) {
          x.disabled = true;
          if (x.textContent === q.correct) x.classList.add("correct");
          else if (x === b) x.classList.add("wrong");
          else x.classList.add("dim");
        });
        if (right) { fb.textContent = cheer() + " 🎉"; feedResolve(meta, true); setTimeout(function () { scrollToNext(meta); }, 950); }
        else { fb.textContent = "Answer: " + q.correct; feedResolve(meta, false); nextHint(inner, "We'll see this one again ⬆️"); }
      });
      wrap.appendChild(b);
    });
  }

  // --- Format: True / False ---
  function buildTF(inner, meta, q) {
    var showCorrect = Math.random() < 0.5;
    var shown = showCorrect ? q.correct : q.wrong[(Math.random() * q.wrong.length) | 0];
    inner.innerHTML =
      '<span class="fmt-tag">🤔 True or False?</span><p class="feed-q"></p>' +
      '<div class="tf-statement"><span class="tf-quote">Is this the right answer?</span><span class="tf-text"></span></div>' +
      '<div class="tf-buttons"><button class="tf-btn t" data-v="1">✅ TRUE</button><button class="tf-btn f" data-v="0">❌ FALSE</button></div>';
    inner.querySelector(".feed-q").textContent = q.q;
    inner.querySelector(".tf-text").textContent = "“" + shown + "”";
    var fb = feedbackEl(inner);
    inner.querySelectorAll(".tf-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        if (meta.answered) return;
        var said = b.getAttribute("data-v") === "1";
        var right = said === showCorrect;
        b.classList.add("picked");
        inner.querySelectorAll(".tf-btn").forEach(function (x) { x.disabled = true; if (x !== b) x.classList.add("dim"); });
        if (right) {
          fb.textContent = (showCorrect ? "Yes, that's correct! 🎉" : "Right — that was wrong! 🎉");
          feedResolve(meta, true); setTimeout(function () { scrollToNext(meta); }, 950);
        } else {
          fb.textContent = showCorrect ? "Actually that answer was correct. ✔️" : "Correct answer: " + q.correct;
          feedResolve(meta, false); nextHint(inner, "We'll see this one again ⬆️");
        }
      });
    });
  }

  // --- Format: This or That (two options) ---
  function buildToT(inner, meta, q) {
    inner.innerHTML = '<span class="fmt-tag">👉 Pick the Right One</span><p class="feed-q"></p><div class="tot"></div>';
    inner.querySelector(".feed-q").textContent = q.q;
    var wrap = inner.querySelector(".tot");
    var fb = feedbackEl(inner);
    var wrong = q.wrong[(Math.random() * q.wrong.length) | 0];
    var opts = shuffle([q.correct, wrong]);
    opts.forEach(function (opt, i) {
      var b = document.createElement("button");
      b.className = "tot-opt";
      b.textContent = opt;
      b.addEventListener("click", function () {
        if (meta.answered) return;
        var right = opt === q.correct;
        wrap.querySelectorAll(".tot-opt").forEach(function (x) {
          x.disabled = true;
          if (x.textContent === q.correct) x.classList.add("correct");
          else x.classList.add("wrong");
        });
        if (right) { fb.textContent = cheer() + " 🎉"; feedResolve(meta, true); setTimeout(function () { scrollToNext(meta); }, 950); }
        else { fb.textContent = "The right one is highlighted ✅"; feedResolve(meta, false); nextHint(inner, "We'll see this one again ⬆️"); }
      });
      wrap.appendChild(b);
      if (i === 0) { var or = document.createElement("span"); or.className = "tot-or"; or.textContent = "OR"; wrap.appendChild(or); }
    });
  }

  // --- Format: Reveal + self check ---
  function buildReveal(inner, meta, q) {
    inner.innerHTML =
      '<span class="fmt-tag">🧠 Do You Know It?</span><p class="feed-q"></p>' +
      '<button class="reveal-btn">Tap to see the answer 👀</button>' +
      '<div class="reveal-answer hidden"><p></p><div class="reveal-grade">' +
      '<button data-k="1">😎 I knew it!</button><button data-k="0">🔁 Show me again</button></div></div>';
    inner.querySelector(".feed-q").textContent = q.q;
    inner.querySelector(".reveal-answer p").textContent = q.a;
    var btn = inner.querySelector(".reveal-btn");
    var ans = inner.querySelector(".reveal-answer");
    btn.addEventListener("click", function () { btn.classList.add("hidden"); ans.classList.remove("hidden"); sndClick(); });
    var fb = feedbackEl(inner);
    inner.querySelectorAll(".reveal-grade button").forEach(function (b) {
      b.addEventListener("click", function () {
        if (meta.answered) return;
        var knew = b.getAttribute("data-k") === "1";
        inner.querySelectorAll(".reveal-grade button").forEach(function (x) { x.disabled = true; });
        if (knew) { fb.textContent = "Awesome! ⭐"; feedResolve(meta, true); setTimeout(function () { scrollToNext(meta); }, 900); }
        else { fb.textContent = "No problem — we'll come back to it!"; feedResolve(meta, false); nextHint(inner); }
      });
    });
  }

  function appendFinishCard() {
    if (feed.finished) return;
    feed.finished = true;
    var el = document.createElement("section");
    el.className = "feed-card fmt-finish";
    el.innerHTML =
      '<div class="finish-emoji">🏆</div>' +
      "<h2>You learned them all!</h2>" +
      "<p>All " + feed.total + " questions mastered. You're a History Hero! 🎉</p>" +
      '<div class="result-buttons">' +
      '<button class="big-btn" id="feed-again">🔁 Go Again</button>' +
      '<button class="big-btn ghost" id="feed-pick">🏠 Pick Another Unit</button>' +
      "</div>";
    feed.cards.push({ isFinish: true, el: el });
    $("feed-scroll").appendChild(el);
    feed.observer.observe(el);
    el.querySelector("#feed-again").addEventListener("click", function () { sndClick(); startFeed(feed.unit); });
    el.querySelector("#feed-pick").addEventListener("click", function () { sndClick(); exitFeed(); });
  }

  function celebrateFinish() {
    if (feed.celebrated) return;
    feed.celebrated = true;
    $("swipe-hint").classList.add("gone");
    sndWin();
    burst(160, true);
    setTimeout(function () { burst(90, true); }, 450);
  }

  // ---------- events ----------
  function bind() {
    // mode toggle
    document.querySelectorAll(".mode-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".mode-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        state.mode = b.getAttribute("data-mode");
        sndClick();
      });
    });

    $("next-btn").addEventListener("click", nextQuestion);
    $("quiz-home").addEventListener("click", function () { show("home"); renderHome(); });
    $("flash-home").addEventListener("click", function () { show("home"); renderHome(); });
    $("feed-home").addEventListener("click", function () { sndClick(); exitFeed(); });
    $("feed-scroll").addEventListener("scroll", function () { $("swipe-hint").classList.add("gone"); }, { passive: true });

    $("flashcard").addEventListener("click", flipFlash);
    $("flash-prev").addEventListener("click", function (e) { e.stopPropagation(); flashStep(-1); });
    $("flash-next").addEventListener("click", function (e) { e.stopPropagation(); flashStep(1); });
    $("flash-shuffle").addEventListener("click", function (e) {
      e.stopPropagation();
      state.deck = shuffle(state.deck); state.index = 0; renderFlash(); sndClick();
    });

    $("play-again").addEventListener("click", function () { sndClick(); startRound(state.unit); });
    $("choose-another").addEventListener("click", function () { sndClick(); show("home"); renderHome(); });

    var st = $("sound-toggle");
    st.textContent = soundOn ? "🔊" : "🔇";
    st.addEventListener("click", function () {
      soundOn = !soundOn;
      localStorage.setItem("histquest_sound", soundOn ? "on" : "off");
      st.textContent = soundOn ? "🔊" : "🔇";
      if (soundOn) sndClick();
    });

    // mascot easter egg
    $("mascot").addEventListener("click", function () { sndCorrect(); burst(30, false); });
  }

  // ---------- init ----------
  renderHome();
  bind();
})();
