import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView; Radix UI (Select/Dropdown) calls it
// when opening popovers, which would throw during tests otherwise.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
