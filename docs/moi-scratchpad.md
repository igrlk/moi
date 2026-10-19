# Scratchpad

The Scratchpad is a shared tldraw canvas in each workspace. Its server code lives
in `server/scratchpad/`; the browser editor is
`client/features/scratchpad/scratchpad.tsx`, and CLI commands live in
`server/cli/commands/scratch.ts`.

## Persistence

`document.ts` loads and saves `.moi/.scratchpad.json`. The file contains the
canvas document and a writer stamp with the Moi and tldraw versions. Browser
camera and selection state are not part of this document.

Image and video bytes live in `.moi/.scratchpad/`. Asset records refer to those
files with an `asset:` source. `assets.ts` handles uploads, content-based
filenames, duplicate detection, extraction of older inline data URLs, and
cleanup. Preserve the asset directory with the document when copying or backing
up a workspace. Deleting it can leave missing images in the saved canvas.

The cleanup pass waits through a grace period before removing unreferenced
assets and preserves assets referenced by the schema-change backup. Saves and
a periodic pass over registered workspaces trigger cleanup.

## Reads and writes

The browser loads and saves through `/api/workspaces/:id/scratchpad` and uploads
or fetches assets through `/api/workspaces/:id/scratchpad/assets`. Saves emit a
workspace event so other tabs can reload; the originating tab can ignore its
own save event.

`moi scratch read` reads a compact shape list from disk. `read-image` resolves an
image's stored source. Drawing, moving, editing, deleting, and clearing go
through `executor.ts`, which uses tldraw's React-free store and schema packages.
Those operations work without an open browser. `shape-defaults.ts` supplies the
shape defaults, checked against tldraw by the executor tests.

`moi scratch view` needs a live Scratchpad tab to render an image. `relay.ts`
sends the request over the chat WebSocket and waits for a browser response.
Run `moi scratch --help` and the relevant subcommand's `--help` for current flags.

## Version skew

Moi pins tldraw and its server-side subpackages to matching versions. Tests check
that the headless store and browser store serialize the same schema.

A server unable to load a snapshot written with a newer schema reports the
version mismatch and leaves the canvas intact. The shared comparison is in
`lib/scratchpad-skew.ts`; `moi scratch read` can still inspect the raw shape list.

Before saving a document whose schema differs from the existing file,
`document.ts` makes a best-effort `.moi/.scratchpad.json.bak` copy. It keeps one
backup, replaced on the next schema change. This is a recovery aid, not a full
backup history. Keep the referenced asset files with any restored snapshot.

## Tests

`server/scratchpad/` contains asset, executor, and version-skew tests.
`server/test/tldraw-pin.test.ts` checks dependency versions, and
`server/test/server-react-free.test.ts` checks that server entry modules do not
load React.
