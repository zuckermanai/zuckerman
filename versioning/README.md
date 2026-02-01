# Agent Versioning System

A separate Git repository system that tracks agent changes independently from your main Git repository.

## Overview

The versioning system creates a hidden `.versioning/.git/` repository that:
- Tracks changes to agent files (`agents/`, `world/`, `interfaces/`)
- Operates completely independently from your main `.git/` repository
- Automatically commits changes with agent context
- Provides rollback capabilities

## How It Works

1. **Initialization**: On first run, creates `.versioning/.git/` as a bare Git repository
2. **Watching**: Monitors specified directories for file changes
3. **Snapshots**: Copies changed files to `.versioning/snapshots/` before committing
4. **Committing**: Automatically commits changes to `.versioning/.git/` with context
5. **Separation**: `.versioning/` is automatically added to your `.gitignore`

## Configuration

Edit `versioning/config.json` to customize:

- `watchPaths`: Directories to watch for changes
- `ignorePatterns`: Files/directories to ignore
- `autoCommit`: Enable/disable automatic commits
- `autoCommitInterval`: Time between auto-commits (milliseconds)
- `commitMessageTemplate`: Template for commit messages

## Usage

### Basic Usage

```typescript
import { VersioningSystem } from "./versioning/index.js";

const versioning = new VersioningSystem();
await versioning.start(); // Start watching and auto-committing
```

### Manual Commit

```typescript
const commitHash = await versioning.commit("Custom commit message", {
  context: "User requested commit"
});
```

### Rollback

```typescript
const rollback = versioning.getRollbackManager();

// List commits
const commits = await rollback.listCommits(10);

// Rollback to specific commit
await rollback.rollback({ commitHash: "abc123" });

// Rollback to previous commit
await rollback.rollbackToPrevious();

// Preview rollback (dry run)
await rollback.rollback({ commitHash: "abc123", dryRun: true });
```

### Git Operations

```typescript
const git = versioning.getGitClient();

// Get commit history
const history = await git.getHistory(10);

// Get diff for a commit
const diff = await git.getDiff("abc123");

// Get current HEAD
const head = await git.getHead();
```

## Architecture

```
.versioning/
├── .git/              # Separate Git repository
└── snapshots/         # File snapshots before commits
    ├── agents/
    ├── world/
    └── interfaces/
```

## Key Features

- **Complete Separation**: `.versioning/.git/` is independent from your `.git/`
- **Standard Git**: Uses standard Git commands and tooling
- **Automatic**: Watches for changes and commits automatically
- **Context-Aware**: Commits include agent context and file information
- **Rollback Support**: Easy rollback to previous versions
- **Snapshot Management**: Files are snapshotted before committing

## Notes

- The `.versioning/` directory is automatically added to `.gitignore`
- Your main Git repository continues to work normally
- The versioning system uses a bare Git repository for cleaner separation
- Snapshots are stored separately for easy file restoration
