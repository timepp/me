# me
my environment - a set of tools for daily work

## Commands

Commands are stored in `commands.json` and executed by `CommandManager`.
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

Run the CLI with:

```powershell
deno task cli
deno task cli --list
deno task cli --run <exact-command-id>
```
