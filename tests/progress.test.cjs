const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../assets/reading-progress.js"), "utf8");

function setup({ height = 2000, top = 0, config = {}, canvas = false } = {}) {
  const rect = { height, top };
  const frames = [];
  const listeners = {};
  let bar;
  let resize;
  const content = {
    classList: { contains: () => canvas },
    getBoundingClientRect: () => rect
  };
  function element() {
    return {
      style: {}, attributes: {}, classList: { toggle() {} },
      setAttribute(key, value) { this.attributes[key] = value; },
      appendChild(child) { this.child = child; }
    };
  }
  const window = {
    innerHeight: 800, DG_READING_PROGRESS: config, ResizeObserver: true,
    requestAnimationFrame(fn) { frames.push(fn); },
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  vm.runInNewContext(source, {
    window,
    document: {
      readyState: "complete",
      querySelector: selector => selector.includes("main.content") ? content : null,
      createElement: element,
      body: { appendChild(el) { bar = el; } }
    },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe(target) { assert.equal(target, content); }
    }
  });
  return { rect, frames, listeners, resize, get bar() { return bar; } };
}

test("measures note progress at start, middle and end and clamps overscroll", () => {
  const runtime = setup();
  runtime.frames.shift()();
  assert.equal(runtime.bar.attributes["aria-valuenow"], "0");
  runtime.rect.top = -600;
  runtime.listeners.scroll();
  runtime.listeners.scroll();
  assert.equal(runtime.frames.length, 1);
  runtime.frames.shift()();
  assert.equal(runtime.bar.attributes["aria-valuenow"], "50");
  runtime.rect.top = -1500;
  runtime.listeners.scroll();
  runtime.frames.shift()();
  assert.equal(runtime.bar.attributes["aria-valuenow"], "100");
  runtime.rect.top = 100;
  runtime.listeners.scroll();
  runtime.frames.shift()();
  assert.equal(runtime.bar.attributes["aria-valuenow"], "0");
});

test("short notes hide; expanding content restores the bar", () => {
  const runtime = setup({ height: 500 });
  runtime.frames.shift()();
  assert.equal(runtime.bar.hidden, true);
  runtime.rect.height = 1600;
  runtime.resize();
  runtime.frames.shift()();
  assert.equal(runtime.bar.hidden, false);
});

test("canvas pages do not create a progress bar", () => {
  assert.equal(setup({ canvas: true }).bar, undefined);
});
