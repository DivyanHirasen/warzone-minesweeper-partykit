# warzone-minesweeper-partykite an OAuth token (useful for CI/CD)
npx partykit token generate
```
ve an env var
npx partykit env remove <key>

# Pull env vars into a file (defaults to partykit.json)
npx partykit env pull
npx partykit env pull .env.json

# Push env vars from partykit.json to the platform
npx partykit env push
```

> Note: run `npx partykit deploy` after adding/pushing env vars for changes to take effect.

### Authentication Commands

```bash
# Log in via GitHub (opens browser)
npx partykit login

# Log out
npx partykit logout

# Show currently logged in user
npx partykit whoami

# Generatgging
npx partykit tail
npx partykit tail --name my-project

# List all deployed projects
npx partykit list

# Delete a deployed project
npx partykit delete
npx partykit delete --name my-project
```

### Environment Variable Commands

```bash
# List all configured env var keys
npx partykit env list

# Add or update an env var (prompts for value)
npx partykit env add <key>

# Remo with [PartyKit](https://partykit.io).

## PartyKit CLI

Install or update the CLI:

```bash
npm install partykit@latest
```

### Project Commands

```bash
# Add PartyKit to an existing project (creates partykit.json, client.ts, server.ts)
npx partykit init

# Start local dev server (watches for changes)
npx partykit dev
npx partykit dev src/server.ts          # specify entry point

# Deploy to PartyKit platform
npx partykit deploy
npx partykit deploy src/server.ts --name my-project

# Tail live logs for debu

A multiplayer minesweeper game built