import { getDirectory, getFilename } from "@opencode-ai/core/util/path"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { List } from "@opencode-ai/ui/list"
import { Select } from "@opencode-ai/ui/select"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { createCommandPaletteFileOpener } from "./command-palette"
import {
  FIND_TEXT_SEARCH_LANGUAGES,
  type FindTextSearchLanguage,
  filterFindTextSearchResults,
  findTextSearchLimitParam,
  findTextSearchSegments,
  findTextSearchVariables,
  mapFindTextSearchResults,
  shouldRunFindTextSearch,
} from "./find-text-search"

export function DialogSearchContent(props: { onOpenFile?: (path: string) => void }) {
  const sdk = useSDK()
  const file = useFile()
  const dialog = useDialog()
  const language = useLanguage()
  const openFile = createCommandPaletteFileOpener(props.onOpenFile)
  const [store, setStore] = createStore({
    query: "",
    language: undefined as FindTextSearchLanguage | undefined,
    highlight: true,
  })

  const languageOptions = [
    { id: undefined, label: language.t("dialog.searchContent.language.all") },
    ...FIND_TEXT_SEARCH_LANGUAGES.map((item) => ({ id: item.id, label: item.label })),
  ]

  const items = async (text: string) => {
    // Read the language filter synchronously so the list refetches when it changes.
    const selected = store.language
    if (!shouldRunFindTextSearch(text)) return []
    return sdk()
      .client.find.text({ pattern: text.trim(), limit: findTextSearchLimitParam() })
      .then((result) => filterFindTextSearchResults(mapFindTextSearchResults(result.data ?? []), selected))
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
          action: (
            <div class="flex items-center gap-1">
              <Select
                options={languageOptions}
                current={languageOptions.find((option) => option.id === store.language)}
                value={(option) => option.id ?? "all"}
                label={(option) => option.label}
                onSelect={(option) => option && setStore("language", option.id)}
                variant="ghost"
                size="small"
              />
              <Tooltip placement="top" value={language.t("dialog.searchContent.highlightVariables")}>
                <IconButton
                  icon="eye"
                  variant={store.highlight ? "secondary" : "ghost"}
                  iconSize="normal"
                  class="size-6"
                  aria-label={language.t("dialog.searchContent.highlightVariables")}
                  aria-pressed={store.highlight}
                  onClick={() => setStore("highlight", !store.highlight)}
                />
              </Tooltip>
            </div>
          ),
        }}
        emptyMessage={language.t("palette.empty")}
        loadingMessage={language.t("common.loading")}
        items={items}
        key={(item) => item.id}
        filterKeys={["path", "text"]}
        skipFilter={() => true}
        onFilter={(value) => setStore("query", value)}
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
              <span class="text-12-regular text-text-weak truncate">
                <Show when={store.highlight} fallback={item.text}>
                  <For each={findTextSearchSegments(item.text, item.matches, findTextSearchVariables(store.query))}>
                    {(segment) => (
                      <span
                        data-segment={segment.kind}
                        classList={{
                          underline: segment.kind !== "plain",
                          "text-text-strong rounded-xs bg-surface-warning-strong/40": segment.kind === "variable",
                        }}
                      >
                        {segment.text}
                      </span>
                    )}
                  </For>
                </Show>
              </span>
            </div>
          </div>
        )}
      </List>
    </Dialog>
  )
}
