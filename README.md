# Tailscale MCP Server

A modern [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that provides seamless integration with Tailscale's CLI commands and REST API, enabling automated network management and monitoring through a standardized interface.

<a href="https://glama.ai/mcp/servers/@comicchang/tailscale-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@comicchang/tailscale-mcp/badge" alt="Tailscale Server MCP server" />
</a>

## 📦 Available Packages

- **NPM**: [`@comicchang/tailscale-mcp-server`](https://www.npmjs.com/package/@comicchang/tailscale-mcp-server)
- **Docker Hub**: [`ooxxcc/tailscale-mcp`](https://hub.docker.com/r/ooxxcc/tailscale-mcp)
- **GitHub Container Registry**: [`ghcr.io/comicchang/tailscale-mcp`](https://github.com/comicchang/tailscale-mcp/pkgs/container/tailscale-mcp)

## 🚀 Recommended Package Manager

This project is optimized for **[Bun](https://bun.sh)** for faster installation and execution. NPM is supported as a fallback option.

### Quick Setup with Bun

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Build and run
bun run build
bun start
```

### Fallback with NPM

```bash
npm ci
npm run build
npm start
```

## Features

- **Device Management**: List, authorize, deauthorize, and manage Tailscale devices
- **Network Operations**: Connect/disconnect, manage routes, and monitor network status
- **Security Controls**: Manage ACLs, device tags, and network lock settings
- **Modern Architecture**: Modular tool system with TypeScript and Zod validation
- **CLI Integration**: Direct integration with Tailscale CLI commands
- **API Integration**: REST API support for advanced operations

## 📚 Documentation

This project includes comprehensive documentation organized by domain:

- **[🔧 CI/CD Workflows](docs/workflows.md)** - GitHub Actions, testing pipelines, and release automation
- **[🧪 Testing Strategy](src/__test__/README.md)** - Unit tests, integration tests, and testing best practices
- **[🐳 Docker Guide](docs/docker.md)** - Container usage, development workflows, and deployment strategies

## Quick Start

### Option 1: NPX (Recommended)

Run directly without installation:

```bash
# Explicit package syntax (most reliable)
npx --package=@comicchang/tailscale-mcp-server tailscale-mcp-server

# Or install globally
npm install -g @comicchang/tailscale-mcp-server
tailscale-mcp-server
```

### Option 2: Docker

```bash
# GitHub Container Registry (recommended)
docker run -d \
  --name tailscale-mcp \
  -e TAILSCALE_API_KEY=your_api_key \
  -e TAILSCALE_TAILNET=your_tailnet \
  ghcr.io/comicchang/tailscale-mcp:latest

# Or use Docker Compose
docker-compose up -d
```

> **📖 For detailed Docker usage, development workflows, and deployment strategies, see the [Docker Guide](docs/docker.md)**

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`~/.claude/claude_desktop_config.json`):

#### Using NPX (Recommended)

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "npx",
      "args": [
        "--package=@comicchang/tailscale-mcp-server",
        "tailscale-mcp-server"
      ],
      "env": {
        "TAILSCALE_API_KEY": "your-api-key-here",
        "TAILSCALE_TAILNET": "your-tailnet-name"
      }
    }
  }
}
```

#### Using Docker

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "TAILSCALE_API_KEY=your-api-key",
        "-e",
        "TAILSCALE_TAILNET=your-tailnet",
        "ghcr.io/comicchang/tailscale-mcp:latest"
      ]
    }
  }
}
```

### Environment Variables

#### Authentication (choose one method)

| Variable                        | Description                   | Required |
| ------------------------------- | ----------------------------- | -------- |
| `TAILSCALE_API_KEY`             | Tailscale API key             | Option 1 |
| `TAILSCALE_OAUTH_CLIENT_ID`     | OAuth client ID               | Option 2 |
| `TAILSCALE_OAUTH_CLIENT_SECRET` | OAuth client secret           | Option 2 |

#### General Configuration

| Variable                 | Description            | Required | Default                     |
| ------------------------ | ---------------------- | -------- | --------------------------- |
| `TAILSCALE_TAILNET`      | Tailscale tailnet name | Yes\*    | -                           |
| `TAILSCALE_API_BASE_URL` | API base URL           | No       | `https://api.tailscale.com` |
| `LOG_LEVEL`              | Logging level (0-3)    | No       | `1` (INFO)                  |
| `MCP_SERVER_LOG_FILE`    | Server log file path   | No       | -                           |

\*Required for API-based operations. CLI operations work without API credentials.

### OAuth vs API Key Authentication

**API Key** (`TAILSCALE_API_KEY`):

- Full permissions matching the user who created the key
- Expires in 1-90 days
- Tied to a specific user account

**OAuth Client** (`TAILSCALE_OAUTH_CLIENT_ID` + `TAILSCALE_OAUTH_CLIENT_SECRET`):

- Scoped permissions (e.g., read-only device access)
- Does not expire (but can be revoked)
- Not tied to any user account
- Recommended for automation and least-privilege access

#### Creating an OAuth Client

1. Go to [Tailscale OAuth Settings](https://login.tailscale.com/admin/settings/oauth)
2. Click "Generate OAuth client"
3. Select the required scopes (e.g., `devices:read` for read-only device access)
4. Copy the client ID and secret

#### OAuth Configuration Example

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "npx",
      "args": [
        "--package=@comicchang/tailscale-mcp-server",
        "tailscale-mcp-server"
      ],
      "env": {
        "TAILSCALE_OAUTH_CLIENT_ID": "your-oauth-client-id",
        "TAILSCALE_OAUTH_CLIENT_SECRET": "your-oauth-client-secret",
        "TAILSCALE_TAILNET": "your-tailnet-name"
      }
    }
  }
}
```

#### Available OAuth Scopes

| Scope              | Description                          |
| ------------------ | ------------------------------------ |
| `all:read`         | Read-only access to all resources    |
| `devices:read`     | Read device information              |
| `devices:core`     | Full device management               |
| `dns:read`         | Read DNS settings                    |
| `dns:write`        | Modify DNS settings                  |
| `acl:read`         | Read ACL configuration               |
| `acl:write`        | Modify ACL configuration             |
| `auth_keys`        | Manage authentication keys           |

See [Tailscale OAuth Scopes](https://tailscale.com/kb/1215/oauth-clients#scopes) for a complete list.

## Available Tools

### Device Management

- `list_devices` - List all devices in the Tailscale network
- `device_action` - Perform actions on specific devices (authorize, deauthorize, delete, expire-key)
- `manage_routes` - Enable or disable routes for devices
- `manage_device_tags` - Manage device tags for organization and ACL targeting
- `manage_device_attributes` - Manage custom device posture attributes
- `manage_exit_nodes` - Manage Tailscale exit nodes and routing

### Network Operations

- `get_network_status` - Get current network status (CLI-first, API fallback)
- `connect_network` - Connect to the Tailscale network
- `disconnect_network` - Disconnect from the Tailscale network
- `ping_peer` - Ping a peer device

### ACL & DNS Management

- `manage_acl` - Manage Access Control Lists (get, update, validate)
- `manage_dns` - Manage DNS configuration (nameservers, MagicDNS, search paths)
- `manage_split_dns` - Manage Split DNS configuration for specific domains
- `manage_keys` - Manage Tailscale authentication keys
- `manage_policy_file` - Manage policy files and preview ACL access rules

### Administration

- `get_version` - Get Tailscale version information
- `get_tailnet_info` - Get detailed network information
- `manage_tailnet_settings` - Get or update Tailscale tailnet settings
- `manage_file_sharing` - Manage Tailscale file sharing settings
- `manage_webhooks` - Manage webhooks for event notifications
- `manage_users` - List and delete tailnet users
- `manage_contacts` - Manage tailnet contacts (security, support)
- `manage_log_streams` - Manage log streaming configuration

## Development

### Quick Setup

```bash
# Clone and setup
git clone https://github.com/comicchang/tailscale-mcp-server.git
cd tailscale-mcp-server

# Install Bun (recommended) or use npm
curl -fsSL https://bun.sh/install | bash
bun install  # or: npm install

# Setup environment
cp .env.example .env
# Edit .env with your Tailscale credentials

# Build and run
bun run build  # or: npm run build
bun start      # or: npm start
```

### Development Commands

```bash
# Development workflow (Bun recommended)
bun run dev:direct        # Fast development with tsx
bun run dev:watch         # Auto-rebuild on changes
bun run build:watch       # Build with file watching

# Development workflow (NPM fallback)
npm run dev:direct
npm run dev:watch
npm run build:watch

# Testing (Bun recommended)
bun test                  # All tests
bun run test:unit         # Unit tests only
bun run test:integration  # Integration tests (requires Tailscale CLI)
bun run test:watch        # Watch mode

# Testing (NPM fallback)
npm test
npm run test:unit
npm run test:integration
npm run test:watch

# Quality assurance (Bun recommended)
bun run qa                # Quick QA (typecheck + unit tests + lint)
bun run qa:full           # Full QA (all tests + checks)
bun run typecheck         # TypeScript validation

# Quality assurance (NPM fallback)
npm run qa
npm run qa:full
npm run typecheck

# Tools (Bun recommended)
bun run inspector         # Test with MCP Inspector

# Tools (NPM fallback)
npm run inspector
```

### Local Claude Desktop Configuration

```json
{
  "mcpServers": {
    "tailscale-dev": {
      "command": "node",
      "args": ["/path/to/your/tailscale-mcp-server/dist/index.js"],
      "env": {
        "TAILSCALE_API_KEY": "your-api-key-here",
        "TAILSCALE_TAILNET": "your-tailnet-name",
        "LOG_LEVEL": "0"
      }
    }
  }
}
```

> **📖 For comprehensive development guides, testing strategies, and CI/CD information:**
>
> - **[Testing Documentation](src/__test__/README.md)** - Unit tests, integration tests, coverage
> - **[Docker Development](docs/docker.md)** - Container-based development workflows
> - **[CI/CD Workflows](docs/workflows.md)** - GitHub Actions, automation, releases

### Project Structure

```bash
src/
├── server.ts              # Main server implementation
├── tools/                 # Modular tool definitions
├── tailscale/             # Tailscale integrations
├── types.ts               # Type definitions
├── logger.ts              # Logging utilities
└── index.ts               # Entry point
```

### Adding New Tools

Create a tool module in `src/tools/` and register it in `src/server.ts`. See existing tools for examples of the modular architecture using Zod schemas and TypeScript.

### Debugging

```bash
# Enable debug logging
export LOG_LEVEL=0
export MCP_SERVER_LOG_FILE=debug-{timestamp}.log

# View logs
tail -f logs/debug-*.log
```

## API Reference

All API methods align with the [Tailscale API v2](https://tailscale.com/api) endpoints.

### Tool Categories

#### Device Tools (`device-tools.ts`)

- Device listing and filtering
- Device authorization management (authorize, deauthorize, delete, expire-key)
- Route management per device (enable/disable subnet routes)

#### Network Tools (`network-tools.ts`)

- Network status monitoring (CLI-first, API device list as fallback)
- Connection management (connect/disconnect via CLI)
- Peer connectivity testing (ping)
- Version information

#### ACL & DNS Tools (`acl-tools.ts`)

- ACL management (get, update, validate)
- DNS configuration (nameservers, MagicDNS, search paths)
- Split DNS configuration (per-domain DNS servers)
- Authentication key management (list, create, delete)
- Policy file management and ACL access preview

#### Admin Tools (`admin-tools.ts`)

- Tailnet information and settings management
- File sharing configuration
- Exit node management
- Webhook management (list, create, delete)
- Device tag management
- User management (list, delete)
- Contact management (security, support)
- Log stream configuration (configuration/network logs)
- Device posture attributes (custom key-value metadata)

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run quality checks: `bun run qa:full` (or `npm run qa:full`)
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Add Zod schemas for input validation
- Include tests for new tools (see [Testing Guide](src/__test__/README.md))
- Follow the existing modular architecture
- Update documentation for new features

### Resources for Contributors

- **[Testing Strategy](src/__test__/README.md)** - How to write and run tests
- **[CI/CD Workflows](docs/workflows.md)** - Understanding the automation pipeline
- **[Docker Development](docs/docker.md)** - Container-based development workflows

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- [Issues](https://github.com/your-repo/issues) - Bug reports and feature requests
- [Discussions](https://github.com/your-repo/discussions) - Questions and community support
- [MCP Documentation](https://modelcontextprotocol.io) - Learn more about MCP

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
