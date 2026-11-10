// Task 12 / T33. The fixture only has one real button (Nav.jsx "Sign out" - covered in
// scanner-fixture.test.js); placeholder/heading/aria-label kinds have no fixture content to
// assert on yet, so those are tested directly against inline JSX source here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFile } from "../src/scanner/babel.js";
import { extractUiStrings } from "../src/scanner/extract-ui-strings.js";

function extract(source, path = "client/src/Form.jsx") {
  return extractUiStrings(parseFile(path, source));
}

test("extracts a heading's text", () => {
  const found = extract(`export default function F() { return <h1>Sign up</h1>; }`);
  assert.deepEqual(found, [{ kind: "heading", text: "Sign up", start_line: 1, end_line: 1 }]);
});

test("extracts an input's placeholder", () => {
  const found = extract(`export default function F() { return <input placeholder="Enter your email" />; }`);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "placeholder");
  assert.equal(found[0].text, "Enter your email");
});

test("extracts an aria-label", () => {
  const found = extract(`export default function F() { return <button aria-label="Close dialog" />; }`);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "aria_label");
  assert.equal(found[0].text, "Close dialog");
});

test("a component named *Button* counts as a button, not just the literal <button> tag", () => {
  const found = extract(`export default function F() { return <SubmitButton>Create account</SubmitButton>; }`);
  assert.deepEqual(found, [{ kind: "button", text: "Create account", start_line: 1, end_line: 1 }]);
});

test("whitespace-only JSX text and empty tags produce nothing", () => {
  const found = extract(`export default function F() { return <h1>   </h1>; }`);
  assert.deepEqual(found, []);
});

test("ignores non-heading, non-button elements entirely", () => {
  const found = extract(`export default function F() { return <div>Just some text</div>; }`);
  assert.deepEqual(found, []);
});
