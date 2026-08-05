# Browser harness guidance

Unit tests and fallback controls do not prove the behavior of production
widgets such as Monaco. Use the browser test runner for focus, keyboard,
responsive layout, hydration, and worker-backed interactions.

## Mount the production path

Use the application's normal entrypoint and mount it with the browser runner.
Keep a stable accessible label or `data-testid` on the interactive control:

```ts
await page.goto('/query');
const editor = page.getByRole('textbox', { name: 'SQL editor' });
await expect(editor).toBeVisible();
await editor.focus();
await expect(editor).toBeFocused();
```

Prefer accessibility queries for user-facing controls. Use a `data-testid`
only for an otherwise-unlabelled widget root or a state that has no accessible
representation.

## Focus and keyboard checks

Wait for the production widget to finish hydration before asserting focus or
typing. Verify the result of the interaction, not only that a key event was
dispatched:

```ts
await expect(editor).toBeFocused();
await editor.press('ControlOrMeta+A');
await editor.press('ArrowDown');
await expect(page.getByRole('option', { name: 'orders' })).toBeVisible();
```

Use the platform-specific modifier names supported by Playwright and cover
desktop and mobile projects when keyboard behavior differs.

## Responsive shell workflow

Run the same test at desktop and mobile viewports. On a narrow viewport,
assert that the editor remains reachable after the schema browser is toggled:

```ts
await page.setViewportSize({ width: 393, height: 852 });
await page.getByRole('button', { name: 'Schema browser' }).click();
await expect(editor).toBeVisible();
await editor.focus();
await expect(editor).toBeFocused();
```

Keep fallback textarea tests as fast unit coverage, but label them as fallback
coverage. Browser tests are the proof for the production editor and shell.
