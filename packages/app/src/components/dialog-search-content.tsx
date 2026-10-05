import { getDirectory, getFilename } from "@opencode-ai/core/util/path"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { List } from "@opencode-ai/ui/list"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { createCommandPaletteFileOpener } from "./command-palette"
import {
  findTextSearchLimitParam,
  mapFindTextSearchResults,
  shouldRunFindTextSearch,
} from "./find-text-search"

export function DialogSearchContent(props: { onOpenFile?: (path: string) => void }) {
  const sdk = useSDK()
  const file = useFile()
  const dialog = useDialog()
  const language = useLanguage()
  const openFile = createCommandPaletteFileOpener(props.onOpenFile)

  const items = async (text: string) => {
    if (!shouldRunFindTextSearch(text)) return []
    return sdk()
      .client.find.text({ pattern: text.trim(), limit: findTextSearchLimitParam() })
      .then((result) => mapFindTextSearchResults(result.data ?? []))
      .catch(() => [])
  }

  return (
    <Dialog class="pt-3 pb-0 !max-h-[480px]" transition>
      <List
        class="px-3"
        search={{
          placeholder: language.t("session.header.searchFiles"),
          autofocus: true,
          hideIcon: true,
        }}
        emptyMessage={language.t("palette.empty")}
        loadingMessage={language.t("common.loading")}
        items={items}
        key={(item) => item.id}
        filterKeys={["path", "text"]}
        skipFilter={() => true}
        onSelect={(item) => {
          if (!item) return
          dialog.close()
          openFile(item.path)
          file.setSelectedLines(item.path, { start: item.line, end: item.line })
        }}
      >
        {(item) => (
          <div class="w-full flex items-center gap-3 rounded-md pl-1 min-w-0">
            <FileIcon node={{ path: item.path, type: "file" }} class="shrink-0 size-4" />
            <div class="flex flex-col min-w-0">
              <div class="flex text-14-regular min-w-0">
                <span class="text-text-weak truncate">{getDirectory(item.path)}</span>
                <span class="text-text-strong whitespace-nowrap">
                  {getFilename(item.path)}:{item.line}
                </span>
              </div>
              <span class="text-12-regular text-text-weak truncate">{item.text}</span>
            </div>
          </div>
        )}
      </List>
    </Dialog>
  )
}
