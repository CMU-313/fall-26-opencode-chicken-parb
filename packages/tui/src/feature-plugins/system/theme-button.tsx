import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { DialogThemeList } from "../../component/dialog-theme-list"

const id = "internal:theme-button"

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      app_bottom() {
        return (
          <box paddingLeft={2} paddingTop={1} flexShrink={0}>
            <text
            fg={api.theme.current.accent}
            onMouseUp={() => {
                api.ui.dialog.replace(() => <DialogThemeList />)
            }}
            >
            Theme
            </text>
          </box>
        )
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
