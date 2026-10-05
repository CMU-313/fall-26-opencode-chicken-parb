import { createMemo, createSignal } from "solid-js"
import { TextAttributes } from "@opentui/core"
import type { PermissionActionConfig, PermissionConfig } from "@opencode-ai/sdk/v2"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useProject } from "../context/project"
import { useTheme } from "../context/theme"
import { DialogSelect, type DialogSelectOption, type DialogSelectRef } from "../ui/dialog-select"

const TOOLS: { key: string; label: string }[] = [
  { key: "read", label: "Read files" },
  { key: "edit", label: "Edit files" },
  { key: "glob", label: "Find files (glob)" },
  { key: "grep", label: "Search files (grep)" },
  { key: "list", label: "List directory" },
  { key: "bash", label: "Run shell (bash)" },
  { key: "task", label: "Delegate task" },
  { key: "external_directory", label: "Access external directory" },
  { key: "todowrite", label: "Write todos" },
  { key: "question", label: "Ask a question" },
  { key: "webfetch", label: "Fetch web page" },
  { key: "websearch", label: "Search the web" },
  { key: "lsp", label: "Language server" },
  { key: "doom_loop", label: "Doom loop" },
  { key: "skill", label: "Run skill" },
]

const NEXT_ACTION: Record<PermissionActionConfig, PermissionActionConfig> = {
  allow: "ask",
  ask: "deny",
  deny: "allow",
}

function ActionLabel(props: { action: PermissionActionConfig; saving: boolean }) {
  const { theme } = useTheme()
  if (props.saving) return <span style={{ fg: theme.textMuted }}>⋯ saving</span>
  const color =
    props.action === "allow" ? theme.success : props.action === "deny" ? theme.error : theme.textMuted
  return <span style={{ fg: color, attributes: TextAttributes.BOLD }}>{props.action}</span>
}

export function DialogPermissions() {
  const sync = useSync()
  const sdk = useSDK()
  const project = useProject()
  const { theme } = useTheme()
  const [, setRef] = createSignal<DialogSelectRef<string>>()
  const [saving, setSaving] = createSignal<string | null>(null)

  const options = createMemo(() => {
    const permission = sync.data.config.permission
    const savingKey = saving()
    return TOOLS.map((tool) => ({
      value: tool.key,
      title: tool.label,
      footer: <ActionLabel action={actionFor(permission, tool.key)} saving={savingKey === tool.key} />,
    }))
  })

  const actions = createMemo(() => [
    {
      command: "dialog.permissions.cycle",
      title: "allow / ask / deny",
      onTrigger: (option: DialogSelectOption<string>) => cycle(option.value),
    },
  ])

  async function cycle(key: string) {
    if (saving() !== null) return
    setSaving(key)
    const next = NEXT_ACTION[actionFor(sync.data.config.permission, key)]
    const workspace = project.workspace.current()
    await sdk.client.config
      .update({ workspace, config: { permission: withAction(sync.data.config.permission, key, next) } })
      .then(() => sdk.client.config.get({ workspace }, { throwOnError: true }))
      .then((refreshed) => refreshed.data && sync.set("config", refreshed.data))
      .finally(() => setSaving(null))
  }

  return (
    <DialogSelect
      ref={setRef}
      title="Permissions"
      titleView={
        <text fg={theme.textMuted}>Cycle each tool's permission for this project (allow / ask / deny)</text>
      }
      options={options()}
      actions={actions()}
      onSelect={(option) => cycle(option.value)}
    />
  )
}

function actionFor(permission: PermissionConfig | undefined, key: string): PermissionActionConfig {
  if (typeof permission === "string") return permission
  const value = permission?.[key]
  if (typeof value === "string") return value
  return "ask"
}

function withAction(permission: PermissionConfig | undefined, key: string, action: PermissionActionConfig) {
  if (permission && typeof permission === "object") return { ...permission, [key]: action }
  const fallback: PermissionActionConfig = typeof permission === "string" ? permission : "ask"
  const expanded = TOOLS.reduce<Record<string, PermissionActionConfig>>((result, tool) => {
    result[tool.key] = fallback
    return result
  }, {})
  expanded[key] = action
  return expanded
}
