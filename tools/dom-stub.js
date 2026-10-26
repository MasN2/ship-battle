// A do-nothing DOM so the game's own modules (combat.js, render.js, ...) can be
// imported and played in Node. Every lookup returns the same inert object, which
// swallows calls, assignments and arithmetic. Import this before any game module.

function makeStub() {
    const target = function () {};
    const stub = new Proxy(target, {
        get(_, key) {
            if (key === Symbol.toPrimitive) return () => 0;
            if (key === Symbol.iterator) return function* () {};
            if (key === 'then') return undefined; // not a promise
            if (key === 'length') return 0;
            return stub;
        },
        apply: () => stub,
        construct: () => stub,
        set: () => true,
    });
    return stub;
}

const stub = makeStub();
const special = {
    'handicap-select': { value: 'normal' },
    handicapSelect: { value: 0 },
};

globalThis.document = new Proxy({}, {
    get(_, key) {
        if (key === 'getElementById') return id => special[id] ?? stub;
        return stub;
    },
});
globalThis.window = stub;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.prompt = () => null;
globalThis.WebSocket = stub;
globalThis.getComputedStyle = () => stub;
globalThis.matchMedia = () => stub;
globalThis.ResizeObserver = stub;
globalThis.requestAnimationFrame = () => 0;
globalThis.Option = stub;
