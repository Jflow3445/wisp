'use strict';
(() => {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const fixed = value => value.toFixed(2);
  // Presentation only: animate revealed returns. Never predict or manufacture an offer.
  window.NisterFlightMotion = class {
    constructor(stage) {
      this.stage = stage;
      this.plane = stage.querySelector('#flight-plane');
      this.body = stage.querySelector('#flight-plane-body');
      this.trail = stage.querySelector('#flight-trail');
      this.glow = stage.querySelector('#flight-trail-glow');
      this.area = stage.querySelector('#flight-area');
      this.wind = Array.from(stage.querySelectorAll('.flight-wind path'));
      this.preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.head = { x: 80, y: 160 }; this.velocity = 0; this.angle = 0; this.points = [];
      this.frame = 0; this.frozen = false; this.windTravel = 0;
      this.preference.addEventListener('change', () => {
        if (this.view) this.update({ ...this.view, server_ms: this.serverMs + performance.now() - this.clock }, true);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stop(); else this.play();
      });
    }
    position(amount) {
      return 280 - clamp(Number(amount) / this.view.stake_cents, 0, 2) * 120;
    }
    progress(serverMs) {
      const elapsed = clamp((serverMs - this.view.start_ms) / (this.view.end_ms - this.view.start_ms), 0, 1);
      // Same deadline and distance, with a calm takeoff and increasing forward speed.
      return 80 + (0.6 * elapsed + 0.4 * elapsed ** 3) * 550;
    }
    update(view, reset = false) {
      const now = performance.now();
      const changed = this.view?.id !== view.id;
      const sameOffer = this.view?.offer?.id === view.offer?.id && this.view?.status === view.status;
      const reconnect = this.view && view.server_ms - this.view.server_ms > view.step_ms * 2;
      this.view = view; this.clock = now; this.serverMs = view.server_ms;
      this.targetY = this.position(view.offer ? view.offer.amount_cents : view.receipt.payout_cents);
      if (this.preference.matches && !changed && !reset && sameOffer) return;
      if (changed || reconnect || reset || this.preference.matches) {
        this.stop(); this.velocity = 0; this.angle = 0;
        if (changed) this.windTravel = 0;
        this.points = view.history.map((value, index) => ({
          x: this.progress(view.start_ms + (view.history_ms?.[index] ?? index * view.step_ms)), y: this.position(value)
        }));
        this.head = { x: this.progress(view.server_ms), y: this.targetY };
        // A settled collection must end at its acceptance time, not a later page refresh.
        if (view.status !== 'ACTIVE') {
          const endedMs = Number(view.receipt.accepted_ms || view.receipt.terminal_ms);
          this.head.x = this.progress(endedMs);
          this.points = this.points.filter(point => point.x < this.head.x);
        }
        this.paint(now);
      }
      this.stage.dataset.motion = view.status === 'ACTIVE' ? (this.frozen ? 'collecting' : 'flying') : 'finished';
      if (view.status !== 'ACTIVE') {
        this.stop(); this.velocity = 0; this.angle = 0; this.head.y = this.targetY; this.paint(now); return;
      }
      this.play();
    }
    freeze(value) {
      if (this.frozen === value) return;
      this.frozen = value;
      if (value) { this.stop(); this.stage.dataset.motion = 'collecting'; }
      else if (this.view?.status === 'ACTIVE') { this.stage.dataset.motion = 'flying'; this.play(); }
    }
    stop() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0; this.lastTime = 0;
    }
    play() {
      if (this.frame || this.frozen || this.preference.matches || document.hidden || this.view?.status !== 'ACTIVE') return;
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame(time => this.tick(time));
    }
    tick(time) {
      this.frame = 0;
      if (this.frozen || document.hidden || this.preference.matches || this.view.status !== 'ACTIVE') return;
      const dt = clamp((time - this.lastTime) / 1000, 0.001, 0.05); this.lastTime = time;
      const serverNow = this.serverMs + time - this.clock;
      // Glide only through the current known offer's window; wait for a new server offer.
      const expiry = Math.min(this.view.offer.expires_ms, this.view.end_ms);
      if (serverNow >= expiry) {
        this.stage.dataset.motion = 'waiting'; return;
      }
      this.stage.dataset.motion = 'flying';
      const nextX = Math.max(this.head.x, this.progress(serverNow));
      const elapsed = clamp((serverNow - this.view.start_ms) / (this.view.end_ms - this.view.start_ms), 0, 1);
      this.windTravel += dt * (35 + 150 * elapsed ** 2);
      const forwardSpeed = Math.max(15, (nextX - this.head.x) / dt);
      const gap = this.targetY - this.head.y;
      // Critically damped response: smooth acceleration and braking, with no altitude overshoot.
      const omega = 8 + 16 * elapsed ** 2 + Math.min(5, Math.abs(gap) * 0.035);
      const decay = Math.exp(-omega * dt), drift = this.velocity + omega * (this.head.y - this.targetY);
      const nextY = this.targetY + ((this.head.y - this.targetY) + drift * dt) * decay;
      this.velocity = (this.velocity - omega * drift * dt) * decay;
      this.head.y = clamp(nextY, Math.min(this.head.y, this.targetY), Math.max(this.head.y, this.targetY));
      if (Math.abs(gap) < 0.03) { this.head.y = this.targetY; this.velocity = 0; }
      this.head.x = nextX;
      const pitch = clamp(Math.atan2(this.velocity, forwardSpeed) * 180 / Math.PI, -36, 38);
      this.angle += (pitch - this.angle) * (1 - Math.exp(-dt * 10));
      this.paint(time);
      this.frame = requestAnimationFrame(next => this.tick(next));
    }
    paint(time) {
      this.lastPaint = time;
      this.wind.forEach((line, index) => line.setAttribute('stroke-dashoffset', fixed(-this.windTravel * (index > 1 ? 1.7 : 1))));
      const previous = this.points[this.points.length - 1];
      if (!previous || this.head.x - previous.x >= 3) this.points.push({ ...this.head });
      const points = this.points.filter(point => point.x < this.head.x).concat({ ...this.head });
      if (!points.length) return;
      let path = 'M' + fixed(points[0].x) + ' ' + fixed(points[0].y);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], bend = (b.x - a.x) * 0.5;
        // Control heights stay inside known endpoints, preserving 0x..2x bounds.
        path += 'C' + fixed(a.x + bend) + ' ' + fixed(a.y) + ' ' + fixed(b.x - bend) + ' ' + fixed(b.y) + ' ' + fixed(b.x) + ' ' + fixed(b.y);
      }
      this.trail.setAttribute('d', path); this.glow.setAttribute('d', path);
      this.area.setAttribute('d', path + 'L' + fixed(this.head.x) + ' 280L' + fixed(points[0].x) + ' 280Z');
      this.plane.setAttribute('transform', 'translate(' + fixed(this.head.x) + ' ' + fixed(this.head.y) + ') rotate(' + fixed(this.angle) + ')');
      this.body.setAttribute('transform', 'scale(1 ' + fixed(1 - Math.min(0.16, Math.abs(this.angle) / 240)) + ')');
    }
  };
})();
