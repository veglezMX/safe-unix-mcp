# safe-unix-mcp

A stdio MCP server that exposes **read-only** Unix-like tools to AI agents (Crush).

- Transport: stdio (MCP).  
- Host: any MCP client (e.g., Crush).  
- OS: Linux/macOS (BSD/GNU differences are handled conservatively).

## Why
- POSIX `find` includes `-exec`/`-ok` which execute commands; we **forbid** them.  
- GNU/BSD `find -delete` is destructive; also **forbidden**.  
- Many coreutils have dangerous flags (e.g., `sed -i`); we **block** them.

References:
- MCP transports & specification.  
- POSIX Shell & Utilities (Open Group).  
- GNU Coreutils manual.

## Installation

### Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/safe-unix-mcp.git
cd safe-unix-mcp
```

### Install globally

```bash
npm install -g .
```

This makes the `mcp-safe-unix` command available system-wide.

### Quick Setup for Crush

After installing globally, run the setup utility to automatically configure your Crush config:

```bash
setup-safe-unix
```

This interactive script will:
- Create `~/.crush.json` if it doesn't exist
- Add the safe-unix MCP server configuration
- Detect and optionally remove potentially unsafe Unix/shell servers
- Update existing safe-unix configuration if already present

**Options:**
```bash
setup-safe-unix --config-path=/custom/path/to/config.json  # Use custom config path
setup-safe-unix --force                                     # Skip confirmation prompts
```

### Manual Setup

If you prefer manual configuration, add the following to your `~/.crush.json`:

```json
{
  "mcpServers": {
    "safe-unix": {
      "command": "mcp-safe-unix",
      "transport": "stdio"
    }
  }
}
```

### Verify installation

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | mcp-safe-unix
```

## Usage with Crush

### Automatic Setup (Recommended)

Use the setup utility after installation:

```bash
setup-safe-unix
```

### Manual Configuration

Add to your `~/.crush.json` configuration file:

```json
{
  "mcpServers": {
    "safe-unix": {
      "command": "mcp-safe-unix",
      "transport": "stdio"
    }
  }
}
```

If you prefer not to install globally, you can specify the full path to the script:

```json
{
  "mcpServers": {
    "safe-unix": {
      "command": "node",
      "args": ["/path/to/safe-unix-mcp/mcp-safe-unix.js"],
      "transport": "stdio"
    }
  }
}
```

Or use `npx`:

```json
{
  "mcpServers": {
    "safe-unix": {
      "command": "npx",
      "args": ["-y", "/path/to/safe-unix-mcp"],
      "transport": "stdio"
    }
  }
}
```

## Available Tools

The server exposes the following safe, read-only Unix tools:

- **Directory & file listing**: `safe_ls`, `safe_pwd`, `safe_stat`, `safe_file`
- **View/paging**: `safe_cat`, `safe_head`, `safe_tail`, `safe_less`, `safe_more`
- **Search & filtering**: `safe_grep`, `safe_awk`, `safe_sed`
- **Text transforms**: `safe_cut`, `safe_paste`, `safe_tr`, `safe_sort`, `safe_uniq`, `safe_fmt`, `safe_fold`, `safe_column`
- **Counting/checksums**: `safe_wc`, `safe_cksum`, `safe_sha`
- **Archive inspection**: `safe_tar_list`, `safe_zipinfo`, `safe_unzip_list`
- **FS usage**: `safe_du`, `safe_df`
- **Process & env**: `safe_env`, `safe_id`, `safe_uname`, `safe_date`, `safe_ps`, `safe_uptime`
- **Safe find**: `safe_find` (without `-exec`, `-ok`, `-delete`)
- **Git (read-only)**: `safe_git` (status, diff, show, log, etc.)
- **JSON/YAML**: `safe_jq`, `safe_yq`
- **Hex/encoding**: `safe_hexdump`, `safe_xxd`, `safe_od`
- **Trees**: `safe_tree`
- **macOS**: `safe_sw_vers`

## Development

### Local testing without global install

```bash
# Test with node directly
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | node mcp-safe-unix.js

# Or use npm link for development
npm link
```

### Uninstall

```bash
npm uninstall -g safe-unix-mcp
```

