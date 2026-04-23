---
name: ls
command: /ls
description: Run `ls -la` in the current directory (example shell plugin)
handler: shell
shellTemplate: ls -la {{args}}
---

Example of a `handler: shell` plugin. The `{{args}}` token is replaced with
whatever the user typed after `/ls`. The stdout/stderr stream back into the
TUI as `plugin_output` events.
