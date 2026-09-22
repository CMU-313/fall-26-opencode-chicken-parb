import { describe, expect, test } from "bun:test"
import {
  FILE_SEARCH_CONTENT_COMMAND_ID,
  FILE_SEARCH_CONTENT_KEYBIND,
} from "./file-search-content-command"

describe("file search content command", () => {
  test("keeps a stable command id and keybind", () => {
    expect(FILE_SEARCH_CONTENT_COMMAND_ID).toBe("file.search-content")
    expect(FILE_SEARCH_CONTENT_KEYBIND).toBe("mod+shift+f")
  })
})
