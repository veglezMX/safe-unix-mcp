#!/usr/bin/env node
/**
 * Setup utility for configuring safe-unix-mcp in Crush config.
 * 
 * Usage:
 *   node setup-crush.js [--config-path=<path>] [--force]
 * 
 * Options:
 *   --config-path=<path>  Custom path to crush config (default: ~/.crush.json)
 *   --force               Skip confirmation prompts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const configPathArg = args.find(a => a.startsWith("--config-path="));
const forceMode = args.includes("--force");

const DEFAULT_CONFIG_PATH = join(homedir(), ".crush.json");
const CONFIG_PATH = configPathArg 
  ? resolve(configPathArg.split("=")[1]) 
  : DEFAULT_CONFIG_PATH;

// Patterns to identify potentially unsafe unix/shell servers
const UNSAFE_PATTERNS = [
  /unix/i,
  /shell/i,
  /bash/i,
  /command/i,
  /exec/i,
  /filesystem/i,
  /file-system/i,
];

function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.log(`📝 Config file not found at: ${CONFIG_PATH}`);
    return null;
  }
  
  try {
    const content = readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`❌ Error reading config: ${err.message}`);
    process.exit(1);
  }
}

function writeConfig(config) {
  try {
    const content = JSON.stringify(config, null, 2) + "\n";
    writeFileSync(CONFIG_PATH, content, "utf8");
    console.log(`✅ Config written to: ${CONFIG_PATH}`);
  } catch (err) {
    console.error(`❌ Error writing config: ${err.message}`);
    process.exit(1);
  }
}

function getSafeUnixConfig() {
  // Determine the best command approach
  // If running from globally installed package, use 'mcp-safe-unix'
  // Otherwise use the local script path
  const localScript = join(__dirname, "mcp-safe-unix.js");
  
  return {
    command: "mcp-safe-unix",
    transport: "stdio",
    description: "Safe read-only Unix tools (no destructive operations)"
  };
}

function detectUnsafeServers(mcpServers) {
  const unsafe = [];
  
  for (const [name, config] of Object.entries(mcpServers)) {
    if (name === "safe-unix") continue; // Skip our own
    
    // Check if name matches unsafe patterns
    const nameMatches = UNSAFE_PATTERNS.some(pattern => pattern.test(name));
    
    // Check if command/description suggests unix/shell tools
    const cmd = config.command || "";
    const desc = config.description || "";
    const cmdMatches = UNSAFE_PATTERNS.some(pattern => 
      pattern.test(cmd) || pattern.test(desc)
    );
    
    if (nameMatches || cmdMatches) {
      unsafe.push({ name, config });
    }
  }
  
  return unsafe;
}

async function prompt(question) {
  if (forceMode) return "y";
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  console.log("🔧 Safe Unix MCP Setup Utility\n");
  
  let config = readConfig();
  let isNewConfig = false;
  
  // Create new config if doesn't exist
  if (!config) {
    const answer = await prompt(`Create new config at ${CONFIG_PATH}? (y/n): `);
    if (answer !== "y") {
      console.log("❌ Setup cancelled.");
      process.exit(0);
    }
    config = {};
    isNewConfig = true;
  }
  
  // Ensure mcpServers exists
  if (!config.mcpServers) {
    console.log("📦 Creating mcpServers section...");
    config.mcpServers = {};
  }
  
  // Check for existing safe-unix configuration
  const hasSafeUnix = !!config.mcpServers["safe-unix"];
  
  // Detect potentially unsafe servers
  const unsafeServers = detectUnsafeServers(config.mcpServers);
  
  if (unsafeServers.length > 0) {
    console.log("\n⚠️  Found potentially unsafe Unix/shell servers:");
    unsafeServers.forEach(({ name, config }) => {
      console.log(`  - "${name}": ${config.command || "unknown command"}`);
    });
    console.log("\n💡 These servers may allow destructive operations.");
    console.log("   safe-unix-mcp provides read-only alternatives.\n");
    
    const answer = await prompt("Remove these unsafe servers? (y/n): ");
    if (answer === "y") {
      unsafeServers.forEach(({ name }) => {
        delete config.mcpServers[name];
        console.log(`  ❌ Removed: ${name}`);
      });
    }
  }
  
  // Add or update safe-unix configuration
  const safeUnixConfig = getSafeUnixConfig();
  
  if (hasSafeUnix) {
    console.log("\n🔄 Updating existing safe-unix configuration...");
  } else {
    console.log("\n➕ Adding safe-unix configuration...");
  }
  
  config.mcpServers["safe-unix"] = safeUnixConfig;
  
  // Show the final configuration
  console.log("\n📋 Final safe-unix configuration:");
  console.log(JSON.stringify({ "safe-unix": safeUnixConfig }, null, 2));
  
  if (!forceMode && !isNewConfig) {
    const answer = await prompt("\nSave changes to config? (y/n): ");
    if (answer !== "y") {
      console.log("❌ Setup cancelled.");
      process.exit(0);
    }
  }
  
  // Write config
  writeConfig(config);
  
  console.log("\n✨ Setup complete!");
  console.log("\n📚 Next steps:");
  console.log("  1. Restart your Crush client");
  console.log("  2. The safe Unix tools should now be available");
  console.log("\n🔍 Available tools include:");
  console.log("  - safe_ls, safe_cat, safe_grep, safe_find");
  console.log("  - safe_git, safe_jq, safe_awk, and many more!");
  console.log("\n📖 See README.md for full list of available tools.");
}

main().catch(err => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
