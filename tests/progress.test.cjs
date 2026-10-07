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
  let mutate;
  let traversals = 0;
  const text = { nodeType: 3, textContent: "word ".repeat(440), parentElement: { closest: () => null } };
  const header = { appendChild(el) { this.meta = el; } };
  const content = {
    classList: { contains: () => canvas },
    querySelector: () => header,
    closest: () => null,
    nodeType: 1,
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
    innerHeight: 800, DG_READING_PROGRESS: { showReadingTime: false, ...config }, ResizeObserver: true, MutationObserver: true,
    requestAnimationFrame(fn) { frames.push(fn); },
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  vm.runInNewContext(source, {
    window,
    location: { pathname: "/test/" },
    document: {
      readyState: "complete",
      addEventListener(name, callback) { listeners[name] = callback; },
      createTreeWalker() {
        traversals++;
        let visited = false;
        return { currentNode: text, nextNode() { if (visited) return false; visited = true; return true; } };
      },
      querySelector: selector => selector.includes("main.content") ? content : null,
      createElement: element,
      body: { appendChild(el) { bar = el; } }
    },
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {
      constructor(callback) { mutate = callback; }
      observe(target, options) { assert.equal(target, content); assert.equal(options.characterData, true); }
    },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe(target) { assert.equal(target, content); }
    }
  });
  return { rect, frames, listeners, resize, mutate, text, content, get traversals() { return traversals; }, get estimate() { return header.meta.child.textContent; }, get bar() { return bar; } };
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

test("reading time is cached across scrolling, layout, folding, images and viewport updates", () => {
  const runtime = setup({ config: { showReadingTime: true } });
  runtime.frames.shift()();
  assert.equal(runtime.estimate, '2 min read');
  assert.equal(runtime.traversals, 1);
  for (let i = 0; i < 20; i++) {
    runtime.rect.top = -600;
    for (const event of ['scroll', 'resize', 'dg:fold-change', 'dg:layout-change', 'dg:appearance-change']) runtime.listeners[event]();
    runtime.resize();
    assert.equal(runtime.frames.length, 1);
    runtime.frames.shift()();
    assert.equal(runtime.bar.attributes['aria-valuenow'], '50');
  }
  runtime.rect.height = 3200;
  runtime.resize(); runtime.frames.shift()();
  assert.equal(runtime.bar.attributes['aria-valuenow'], '25');
  assert.equal(runtime.traversals, 1);
});

test("text and content changes invalidate once; excluded UI changes do not recount or loop", () => {
  const runtime = setup({ config: { showReadingTime: true } });
  runtime.frames.shift()();
  runtime.text.textContent = 'word '.repeat(660);
  runtime.mutate([{type:'characterData',target:runtime.text}]);
  runtime.mutate([{type:'childList',target:runtime.content,addedNodes:[runtime.text],removedNodes:[]}]);
  assert.equal(runtime.frames.length, 1);
  runtime.frames.shift()();
  assert.equal(runtime.estimate, '3 min read');
  assert.equal(runtime.traversals, 2);
  const excluded = { nodeType:1, closest:() => ({}), matches:() => true };
  runtime.mutate([{type:'characterData',target:{parentElement:excluded}}, {type:'childList',target:runtime.content,addedNodes:[excluded],removedNodes:[excluded]}]);
  assert.equal(runtime.frames.length, 0);
  runtime.text.textContent = 'word '.repeat(220);
  runtime.mutate([{type:'childList',target:runtime.content,addedNodes:[],removedNodes:[{nodeType:3,parentElement:null}]}]);
  runtime.frames.shift()();
  assert.equal(runtime.estimate, '1 min read');
  assert.equal(runtime.traversals, 3);
  runtime.text.textContent = 'word '.repeat(440);
  runtime.mutate([{type:'characterData',target:runtime.text}]); runtime.frames.shift()();
  assert.equal(runtime.estimate, '2 min read');
  // Mutation records must still count removal after text moves into excluded UI.
  runtime.text.parentElement = excluded;
  runtime.mutate([{type:'childList',target:runtime.content,addedNodes:[],removedNodes:[runtime.text]}]);
  runtime.frames.shift()();
  assert.equal(runtime.estimate, '1 min read');
  assert.equal(runtime.traversals, 5);
});

test("disabled reading-time display does not traverse or install its content observer", () => {
  const runtime = setup(); runtime.frames.shift()();
  assert.equal(runtime.traversals, 0);
  assert.equal(runtime.mutate, undefined);
});
