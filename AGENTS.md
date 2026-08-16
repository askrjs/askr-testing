# AGENTS.md

Operational guide for `@askrjs/testing`, which owns transport-neutral request
injection and focused browser-harness guidance.

## Askr North Star

Keep every helper's simulation boundary explicit so a reader knows which real
mechanisms it does and does not exercise. Reject invalid requests, redirect
state, lifecycle use, and harness configuration with actionable errors. Test
redirect, abort, streaming, cleanup, and thrown paths. Keep request injection,
browser testing, and real transport testing as visible, non-interchangeable
seams. Prefer explicit handlers and requests over hidden globals or matcher
magic. Add helpers only for demonstrated application test needs.

Run `npm run check` before declaring a change ready.

## Optimization Gate

A benchmark number is only half of an optimization's success criterion. The
change must also preserve a causal path that a human or agent can narrate in one
sentence.

Every benchmark-driven change must include:

1. the one-sentence causal description of the optimized path;
2. the exact fallback trigger and proof that optimized and fallback paths have
   identical observable behavior and error surfaces;
3. an explicit legibility-cost statement, including `none` when no new path or
   concept is introduced; and
4. evidence that a measured bottleneck in a real application justifies the
   optimization now.

Prefer making the existing single path faster. New caches, inference,
memoization, shortcuts, fast paths, or scheduler states require an explicit
legibility decision; a speedup alone does not justify them.
