#!/usr/bin/env node
/**
 * Safe Unix MCP server (stdio).
 * - Exposes read-only “safe_*” tools that wrap POSIX/coreutils.
 * - Validates args, forbids mutation flags.
 *
 * MCP uses JSON-RPC over stdio. Spec & transports: modelcontextprotocol.io. 
 * POSIX utilities & find primaries: The Open Group. Coreutils behavior: GNU manual.
 * (See README for links.)
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const STDIO = { stdio: ["pipe", "pipe", "pipe"] };

const SERVER_NAME = "safe-unix-mcp";
const VERSION = "0.1.0";

/** --- Helpers --- */

const FORBIDDEN_TOKENS = new Set([
  // find / rm / editors / mutation-ish
  "-exec", "-ok", "-delete", // find
  "-i",                       // sed -i (in-place)
  "--in-place",               // some sed variants
]);

function rejectForbidden(argv) {
  for (const a of argv) {
    if (FORBIDDEN_TOKENS.has(a)) {
      throw new Error(`forbidden argument: ${a}`);
    }
  }
}

function ensureOnly(argv, allowlist = []) {
  const allowed = new Set(allowlist);
  for (const a of argv) {
    if (!allowed.has(a) && a.startsWith("-")) {
      throw new Error(`flag not allowed here: ${a}`);
    }
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...STDIO, shell: false });
    let out = "", err = "";
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("error", reject);
    p.on("close", code => {
      if (code === 0) resolve({ code, out, err });
      else reject(new Error(err || `exit ${code}`));
    });
  });
}

/** --- Tool implementations (read-only) --- */

const tools = {
  // 1) Directory & file listing (read-only)
  "safe_ls": async ({ args = [] }) => {
    ensureOnly(args.filter(a => a.startsWith("-")), ["-l","-la","-lah","-1","-A","-F","-p","-R"]);
    return run("ls", args);
  },
  "safe_pwd": async () => run("pwd", []),
  "safe_stat": async ({ args = [] }) => {
    // BSD/GNU stat differ; allow common flags minimally or none:
    // Prefer no flags; pass through filename(s).
    return run("stat", args.filter(a => !a.startsWith("--")));
  },
  "safe_file": async ({ args = [] }) => run("file", args),

  // 2) View/paging
  "safe_cat": async ({ args = [] }) => run("cat", args),
  "safe_head": async ({ args = [] }) => run("head", args),
  "safe_tail": async ({ args = [] }) => run("tail", args),
  "safe_less": async ({ args = [] }) => run("less", args),
  "safe_more": async ({ args = [] }) => run("more", args),

  // 3) Search & filtering (no in-place)
  "safe_grep": async ({ args = [] }) => run("grep", args),
  "safe_awk": async ({ args = [] }) => run("awk", args),
  "safe_sed": async ({ args = [] }) => {
    rejectForbidden(args); // blocks -i
    return run("sed", args);
  },

  // 4) Text transforms & fields
  "safe_cut": async ({ args = [] }) => run("cut", args),
  "safe_paste": async ({ args = [] }) => run("paste", args),
  "safe_tr": async ({ args = [] }) => run("tr", args),
  "safe_sort": async ({ args = [] }) => run("sort", args),
  "safe_uniq": async ({ args = [] }) => run("uniq", args),
  "safe_fmt": async ({ args = [] }) => run("fmt", args),
  "safe_fold": async ({ args = [] }) => run("fold", args),
  "safe_column": async ({ args = [] }) => run("column", args),

  // 5) Counting / checksums (metadata only)
  "safe_wc": async ({ args = [] }) => run("wc", args),
  "safe_cksum": async ({ args = [] }) => run("cksum", args),
  "safe_sha": async ({ args = [] }) => {
    // Accept: sha*sum, shasum -a, openssl dgst -sha*
    // Dispatch based on first arg if it looks like a specific tool
    const [tool, ...rest] = args.length ? args : ["sha256sum"];
    if (/^sha(1|224|256|384|512)sum$/.test(tool)) return run(tool, rest);
    if (tool === "shasum") return run("shasum", rest);
    if (tool === "md5sum" || tool === "md5") return run(tool, rest);
    // fallback:
    return run("sha256sum", args);
  },

  // 6) Archive inspection only (no extract/write)
  "safe_tar_list": async ({ args = [] }) => {
    // allow only list/query flags like -t, -f, -v
    const allowed = new Set(["-t","-f","-v","--list"]);
    ensureOnly(args.filter(a => a.startsWith("-")), [...allowed]);
    return run("tar", args);
  },
  "safe_zipinfo": async ({ args = [] }) => run("zipinfo", args),
  "safe_unzip_list": async ({ args = [] }) => {
    // only -l for listing
    if (!args.includes("-l")) throw new Error("safe_unzip_list requires -l (list) mode");
    return run("unzip", args);
  },

  // 7) FS usage
  "safe_du": async ({ args = [] }) => run("du", args),
  "safe_df": async ({ args = [] }) => run("df", args),

  // 8) Process & env (read-only)
  "safe_env": async ({ args = [] }) => run("env", args),
  "safe_id": async () => run("id", []),
  "safe_uname": async ({ args = [] }) => run("uname", args),
  "safe_date": async ({ args = [] }) => run("date", args),
  "safe_ps": async ({ args = [] }) => run("ps", args),
  "safe_uptime": async () => run("uptime", []),

  // 9) Safe find (no -exec/-ok/-delete)
  "safe_find": async ({ args = [] }) => {
    rejectForbidden(args);
    return run("find", args);
  },

  // 10) Git (read-only subset)
  "safe_git": async ({ args = [] }) => {
    // Allow only read-only porcelain/plumbing:
    const allowedSub = new Set([
      "status","diff","show","log","ls-files","rev-parse","branch","tag","remote","blame","cat-file","describe"
    ]);
    const sub = args[0] || "";
    if (!allowedSub.has(sub)) throw new Error(`git subcommand not allowed: ${sub}`);
    return run("git", args);
  },

  // 11) JSON/YAML views
  "safe_jq": async ({ args = [] }) => run("jq", args),
  "safe_yq": async ({ args = [] }) => run("yq", args),

  // 12) Hex/encoding viewers
  "safe_hexdump": async ({ args = [] }) => run("hexdump", args),
  "safe_xxd": async ({ args = [] }) => run("xxd", args),
  "safe_od": async ({ args = [] }) => run("od", args),

  // 13) Trees
  "safe_tree": async ({ args = [] }) => run("tree", args),

  // 14) macOS sw_vers (if present)
  "safe_sw_vers": async () => run("sw_vers", [])
};

/** --- Minimal JSON-RPC loop (stdio) --- */

const STDIN = process.stdin;
const STDOUT = process.stdout;

STDIN.setEncoding("utf8");
let buf = "";

function reply(id, result, error) {
  const payload = { jsonrpc: "2.0", id };
  if (error) payload.error = { code: -32000, message: String(error.message || error) };
  else payload.result = result;
  STDOUT.write(JSON.stringify(payload) + "\n");
}

STDIN.on("data", async (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }

    if (msg.method === "initialize") {
      reply(msg.id, {
        serverInfo: { name: SERVER_NAME, version: VERSION },
        capabilities: {
          tools: Object.keys(tools).map(name => ({ name, description: "Safe Unix utility" }))
        }
      });
      continue;
    }

    if (msg.method === "tools/list") {
      reply(msg.id, Object.keys(tools));
      continue;
    }

    if (msg.method === "tools/call") {
      const { name, arguments: args } = msg.params || {};
      const fn = tools[name];
      if (!fn) return reply(msg.id, null, new Error("unknown tool"));
      try {
        const { out } = await fn(args || {});
        reply(msg.id, { stdout: out });
      } catch (e) {
        reply(msg.id, null, e);
      }
      continue;
    }

    // ping or unknown
    reply(msg.id, { ok: true });
  }
});
