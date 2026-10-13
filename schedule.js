/* Pure schedule logic: no DOM, no timers. Works in the browser and in Node tests. */
(function (root) {
  var STEP_MS = 15 * 60 * 1000;
  // If a timer fires later than this after its mark (sleep, heavy throttling),
  // the reminder is stale: skip it and re-anchor to the clock instead.
  var LATE_GRACE_MS = 2 * 60 * 1000;

  var MESSAGES = {
    race: { text: "Time to race!", emoji: "\u{1F3C1}", kind: "race" },
    butterflies: { text: "Go catch some butterflies!", emoji: "\u{1F98B}", kind: "butterflies" },
  };

  /** First quarter-hour mark (:00/:15/:30/:45, local time) strictly after `nowMs`. */
  function nextMark(nowMs) {
    var d = new Date(nowMs);
    var minute = Math.floor(d.getMinutes() / 15) * 15 + 15;
    d.setMinutes(minute, 0, 0); // minute 60 rolls over to the next hour (and day) correctly
    return d.getTime();
  }

  /** :00 and :30 -> race, :15 and :45 -> butterflies. */
  function messageFor(markMs) {
    return new Date(markMs).getMinutes() % 30 === 0 ? MESSAGES.race : MESSAGES.butterflies;
  }

  /** The next `count` marks after `nowMs`. */
  function upcoming(nowMs, count) {
    var out = [];
    var t = nextMark(nowMs);
    for (var i = 0; i < count; i++) {
      out.push(t);
      t = nextMark(t);
    }
    return out;
  }

  /**
   * Decide what to do on a tick. Always derived from the current time, never from
   * elapsed intervals, so sleep and clock changes self-correct.
   * Returns { fire: markMs | null, target: nextTargetMs }.
   */
  function evaluate(nowMs, targetMs) {
    var expected = nextMark(nowMs);
    if (targetMs == null) return { fire: null, target: expected };
    if (nowMs >= targetMs) {
      var late = nowMs - targetMs;
      return { fire: late <= LATE_GRACE_MS ? targetMs : null, target: expected };
    }
    // Not due yet. If the clock jumped, the old target no longer matches the clock.
    return { fire: null, target: expected };
  }

  var api = {
    STEP_MS: STEP_MS,
    LATE_GRACE_MS: LATE_GRACE_MS,
    MESSAGES: MESSAGES,
    nextMark: nextMark,
    messageFor: messageFor,
    upcoming: upcoming,
    evaluate: evaluate,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Schedule = api;
})(typeof self !== "undefined" ? self : this);
