# me
my environment - a set of tools for daily work

## Commands

Commands are stored in `commands.json` and executed by `CommandManager`.
Commands returned by `getCommands`, `addCommand` and `updateCommand` include
`runcount` (number of history records, including running and failed runs) and
`lastrun` (latest run start time as a UTC ISO string, or `null` if never run).
These fields are computed from backend history, not saved in `commands.json`.
Compound runs count toward the parent command's history; nested children do not
create additional top-level runs.
Configuration commands can check their current state and return one of:
`satisfied`, `unsatisfied`, `unknown`, or `error`.

Windows configuration command types include:

- `registry`
- `pathEntry`
- `scheduledTask`
- `shortcut`
- `junction`
- `fileContent`
- `powerShell`

Set `elevated` to `true` when applying a command requires UAC elevation.
Status checks do not elevate.

Use the toolbar's **Add command** button to create a command. Select its type
in the dialog's left navigation (above the form on narrow screens). Common
fields are shared across types, and switching types preserves each type's
unfinished fields until the dialog is closed. Editing keeps the existing type.
Item actions in command, history and OneAuth lists use emoji keys rendered
directly by `visualizeArray`, without a custom action renderer.

The frontend uses compact spacing and a viewport-responsive base font size
(`0.875vw`, clamped to 10–14px), keeping controls and dialogs smaller on large
screens. Browser zoom remains available for adjusting readability.

The frontend initially shows `unknown` for commands that support status, without
automatically checking them. Commands without status checks omit the `status`
property, including terminal commands without `statusPort` and PowerShell
commands without `statusScript`. Use **Check All Statuses** in the toolbar to check
all status-capable commands, or **Refresh Status** on an individual command.
Running a command still updates its status afterward.

Terminal commands execute `command` directly with the `args` array, without
opening a new terminal or interpreting shell syntax. During execution,
stdout and stderr are streamed through the optional `onCommandEvent` callback
on `runConfiguredCommand`, including for terminal commands nested in compound
commands. The frontend shows three regions per process:

- **Command Result:** shown only after exit (exit code and optional signal) or
  execution failure.
- **Command Output:** continuously updated stdout.
- **Command Error Output:** continuously updated stderr.

Every Run opens a dialog for a separate execution record. The run dialog starts
with a minimum height and grows with its content up to 90% of the viewport height,
then scrolls internally. Closing the dialog does not stop execution or discard
its status, results, or output. Use the
toolbar's **Run History** to reopen any execution, or a command's **Run History**
action to see only that command's runs. Running records continue to update when
reopened; completed and failed records retain their final results. History is
persisted by the backend in `command-history.sqlite`, next to `commands.json`,
for both frontend and CLI runs. Each run has a backend-generated ID, a command
configuration/name snapshot, start and finish timestamps (UTC ISO strings),
state, results, errors, and separate stdout/stderr for every terminal child.
Concurrent runs and repeated children in compound commands have separate records.
History survives page refreshes, backend restarts, command edits and deletion.
Interrupted runs are marked failed when queried after their backend process exits.

The API exposes `getCommandRunHistory(commandId?)` for newest-first summaries
without output, and `getCommandRun(runId)` for a full record, including output.
The optional fourth `onRunStarted` callback on `runConfiguredCommand` receives
the persisted run summary before execution. Existing return values and terminal
event callbacks are unchanged. The frontend history dialog uses `visualizeArray`
with table/tile views and an **Open** action for each run. It queries once when
opened; use **Refresh** to update the list manually. Running output dialogs query
the backend every 500 ms until completion; closing a dialog stops its queries,
not the command.
A disconnected output callback is logged and detached without stopping execution.

Each frontend output region displays the most recent 1 MiB and indicates when
older output has been truncated. The backend stores complete output incrementally
in SQLite, without this display limit. History has no automatic expiration;
output and results may contain sensitive data, so protect the local database
and its SQLite sidecar files. Database files are excluded from Git.
The CLI streams directly to its stdout/stderr. Output is displayed as
text, preserving line breaks; child processes may buffer their own output.
Nonzero exits still fail the command after delivering the completion event.
Commands requiring a shell must specify it explicitly, for example
`command: "cmd.exe"` with `args: ["/c", "dir"]`. Interactive commands are not
supported. The API promise resolves after exit and both output streams have
drained, while callbacks deliver output during execution.

Run the CLI with:

```powershell
deno task cli
deno task cli --list
deno task cli --run <exact-command-id>
```
