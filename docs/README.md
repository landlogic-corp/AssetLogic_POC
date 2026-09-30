# Documentation index

Start with the page that matches what you are trying to do.

## I want to…

| Goal | Read |
|---|---|
| Run the project on my machine | [local-setup.md](local-setup.md) |
| Understand how the whole thing works | [architecture.md](architecture.md) |
| Find out what a particular file does | [directory-guide.md](directory-guide.md) |
| Change something on the page | [frontend.md](frontend.md) |
| Call or change a server function | [api.md](api.md) |
| Understand what is stored and how alerts are produced | [database.md](database.md) |
| Import a new dataset | [data-pipeline.md](data-pipeline.md) |
| Publish a change | [deployment.md](deployment.md), then [contributing.md](contributing.md) |
| Check whether something is safe to commit | [security.md](security.md) |
| Fix an error I am seeing | [troubleshooting.md](troubleshooting.md) |
| Decode a planning term | [glossary.md](glossary.md) |
| See what changed and what is next | [release-notes.md](release-notes.md) |

## Suggested reading order for a new team member

1. [../README.md](../README.md): what the product is.
2. [architecture.md](architecture.md): the moving parts and how a request flows through them.
3. [local-setup.md](local-setup.md): get it running.
4. [directory-guide.md](directory-guide.md): orient yourself in the files.
5. [frontend.md](frontend.md) or [api.md](api.md), depending on what you will work on.
6. [contributing.md](contributing.md) and [security.md](security.md) before your first change.

## Internal documents

Some documents are deliberately **not** in this public repository. They live in `docs/internal/`,
which is git-ignored, and are handed over by a project administrator.

| Document | What it covers | Referred to from |
|---|---|---|
| **Database ERD and data dictionary** | Every table, column, relationship, function, view and role grant | [database.md](database.md), [api.md](api.md), [data-pipeline.md](data-pipeline.md) |
| **Infrastructure map** | Every account, project, instance, service account and environment variable, and how they connect | [architecture.md](architecture.md), [deployment.md](deployment.md), [security.md](security.md) |
| **Schema definition** | The full database definition that the migration script runs | [database.md](database.md), [data-pipeline.md](data-pipeline.md) |
| **Database provisioning guide** | How the database environment was created | [deployment.md](deployment.md) |
| **Source data mapping** | What each source file contains and how its columns map in | [data-pipeline.md](data-pipeline.md) |

Why they are separate: the public documentation explains how the system works well enough to run
and change it. The internal set contains the detail someone would need to reproduce or probe the
production environment. None of the internal documents contains a password, token or key either;
those exist only in the hosting provider's environment settings and in each developer's local
configuration.

If you are on the LandLogic team and need them, ask the project administrator. Put the folder at
`docs/internal/` in your working copy; git will ignore it.

## Conventions used in these documents

- Paths are relative to the repository root unless stated.
- Commands are written for a POSIX shell. They work unchanged in Git Bash on Windows; PowerShell
  differences are called out where they matter.
- "The page" means `asset-monitor.html` and the `index.html` generated from it.
- "Functions" means the server-side handlers in `netlify/functions/`.
- Diagrams are written in Mermaid and render on GitHub.
