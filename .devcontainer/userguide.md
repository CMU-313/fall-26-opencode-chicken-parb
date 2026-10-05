This file descirbes the changes made to the opencode repository as part of the project 2 requirements. 

Global Search: The global search feature allows a user to search across all files in a project, with a highlighted line and line number being returned. The search dialouge boxes limits these returns to 25, so even common terms don't have unreasonable amounts of returned results. A user can also activate global search with Aditionally, if the user calls the search API directly, they can specify their custom limit: 

Tests: This feature can be tested along 4 prongs - search helpers, command level, query validation, and endpoint. New tests ensure that whitespaces are skipped, files from across the project are returned, and the limiting feature works as intended. These 4 areas are completley exhaustive relative to the changes made in this feature.

Search helper tests: packages/app/src/components/find-text-search.test.ts

Command: packages/app/src/pages/session/file-search-content-command.test.ts

Limit: packages/opencode/test/server/httpapi-find-text-query.test.ts

API: packages/opencode/test/server/httpapi-file-find-text.test.ts
packages/opencode/test/server/httpapi-file.test.ts


Always Allow Bypass: You can now edit the config.json file directly in Opencode's UI.

Tests: Ensures the config file changes as expected, and that these settings remain constant across new sessions. Ensures current sessions reload their config files. This test is sufficient because the feature only edits the config.json file and has no side effects.

packages/opencode/src/config/config.test.ts

