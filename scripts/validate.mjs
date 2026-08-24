import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, extname, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const problems = [];

function fail(message) {
  problems.push(message);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(join(root, dir))) {
    if (entry === "node_modules" || entry.startsWith(".")) {
      continue;
    }
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) {
      walk(rel, out);
    } else {
      out.push(rel.split("\\").join("/"));
    }
  }
  return out;
}

const allFiles = walk(".");
const htmlFiles = allFiles.filter((path) => path.endsWith(".html"));
const jsFiles = allFiles.filter((path) => path.endsWith(".js"));

const manifest = JSON.parse(read("manifest.json"));

if (manifest.manifest_version !== 3) {
  fail("manifest_version이 3이 아닙니다.");
}

const referenced = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {})
].filter(Boolean);

for (const path of referenced) {
  if (!existsSync(join(root, path))) {
    fail(`manifest이 가리키는 파일이 없습니다: ${path}`);
  }
}

for (const permission of ["sidePanel", "storage", "identity", "clipboardWrite"]) {
  if (!manifest.permissions?.includes(permission)) {
    fail(`권한이 빠졌습니다: ${permission}`);
  }
}

function extensionIdFromKey(key) {
  const der = Buffer.from(String(key), "base64");
  const hash = createHash("sha256").update(der).digest("hex").slice(0, 32);
  return [...hash].map((c) => String.fromCharCode(parseInt(c, 16) + 97)).join("");
}

let extensionId = null;
if (!manifest.key) {
  fail("manifest.json에 key가 없습니다. 개발자마다 확장 ID가 달라져 OAuth 콜백이 깨집니다.");
} else {
  extensionId = extensionIdFromKey(manifest.key);
  if (!/^[a-p]{32}$/.test(extensionId)) {
    fail("manifest.json의 key에서 올바른 확장 ID를 도출하지 못했습니다.");
  }
}

const csp = manifest.content_security_policy?.extension_pages ?? "";
if (!csp.includes("wss://*.supabase.co")) {
  fail("CSP의 connect-src에 wss://*.supabase.co가 없습니다. 실시간 연결이 막힙니다.");
}

for (const htmlPath of htmlFiles) {
  const html = read(htmlPath);
  if (/<script(?![^>]*\ssrc=)/i.test(html)) {
    fail(`인라인 스크립트가 있습니다: ${htmlPath}`);
  }
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1];
    if (target.startsWith("#") || target.startsWith("mailto:") || target.startsWith("tel:")) {
      continue;
    }
    if (target.startsWith("http") || target.startsWith("data:")) {
      fail(`외부 리소스를 참조합니다: ${htmlPath} -> ${target}`);
      continue;
    }
    const resolved = posix.normalize(posix.join(posix.dirname(htmlPath), target));
    if (!existsSync(join(root, resolved))) {
      fail(`없는 파일을 참조합니다: ${htmlPath} -> ${target}`);
    }
  }
}

const config = read("config.js");
if (!config.includes("export const CONFIG")) {
  fail("config.js가 CONFIG를 export하지 않습니다.");
}
if (/service_role|SUPABASE_SERVICE|R2_SECRET|secret_key/i.test(config)) {
  fail("config.js에 비밀 키로 보이는 값이 있습니다. anon key만 넣으세요.");
}

const schema = read("supabase/schema.sql");
for (const needle of [
  "create trigger boxes_sync_usage after insert or update or delete",
  "on_auth_user_created",
  "replica identity full",
  "enable row level security",
  "alter table public.box_user_state enable row level security",
  "alter table public.analytics_events enable row level security",
  "alter table public.subscriptions enable row level security",
  "alter table public.invitations enable row level security"
]) {
  if (!schema.includes(needle)) {
    fail(`schema.sql에서 확인하지 못했습니다: ${needle}`);
  }
}

const authSource = read("src/auth.js");
const sidepanel = read("sidepanel.html");
if (!authSource.includes("AUTH_REDIRECT_MISCONFIGURED") || !sidepanel.includes("signin-redirect-url")) {
  fail("확장 OAuth 콜백 설정 오류 안내가 빠져 있습니다.");
}

for (const table of ["box_user_state", "analytics_events", "subscriptions", "invitations", "box_list"]) {
  if (!schema.includes(`revoke all on public.${table} from anon, authenticated;`)) {
    fail(`schema.sql에서 ${table}의 anon 권한 회수를 확인하지 못했습니다.`);
  }
}

if (/service_role|SUPABASE_SERVICE_ROLE/.test(schema)) {
  fail("schema.sql에 service_role 참조가 있습니다.");
}

for (const needle of [
  "box_limit = 50, space_limit = 3, member_limit = null",
  "box_limit = 100, space_limit = 10, member_limit = null",
  "v_token := encode(gen_random_bytes(18), 'hex')",
  "item.key in ('surface', 'lever', 'plan', 'count', 'role', 'mode', 'reason')"
]) {
  if (!schema.includes(needle)) {
    fail(`확정 정책 또는 보안 규칙이 없습니다: ${needle}`);
  }
}
if (schema.includes("MEMBER_LIMIT_REACHED")) {
  fail("참여 무제한 정책과 충돌하는 MEMBER_LIMIT_REACHED가 남아 있습니다.");
}

const landing = read("index.html");
for (const forbidden of ["팀원 3명까지", "박스 300개", "박스 1,000개", "4,900원", "12,900원"]) {
  if (landing.includes(forbidden)) {
    fail(`랜딩에 미확정 또는 폐기된 요금제 문구가 남아 있습니다: ${forbidden}`);
  }
}

const insertFeature = read("src/features/insert.js");
if (!insertFeature.includes("permissionForUrl") || !insertFeature.includes("chrome.permissions.request(permission)")) {
  fail("삽입 권한을 현재 사이트 origin 단위로 요청하지 않습니다.");
}

if (!existsSync(join(root, ".github/workflows/check.yml"))) {
  fail("GitHub Actions 검사 워크플로가 없습니다.");
}
if (!existsSync(join(root, "supabase/migrations/003-policy-alignment.sql"))) {
  fail("기존 DB 교정용 003-policy-alignment.sql이 없습니다.");
}

const manifestPermissions = manifest.permissions ?? [];
for (const risky of ["tabs", "history", "cookies", "webNavigation", "<all_urls>"]) {
  if (manifestPermissions.includes(risky)) {
    fail(`권한이 과합니다: ${risky}. 최소 권한을 유지하세요.`);
  }
}
if ((manifest.host_permissions ?? []).some((entry) => entry.includes("*://*/*") || entry === "<all_urls>")) {
  fail("host_permissions가 모든 사이트를 요구합니다. optional_host_permissions를 쓰세요.");
}

for (const path of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", join(root, path)], { stdio: "pipe" });
  } catch (error) {
    fail(`문법 오류: ${path}\n${String(error.stderr ?? error.message).trim()}`);
  }
}

for (const path of jsFiles) {
  const source = read(path);
  const pattern = /\bfrom\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) {
      continue;
    }
    const resolved = posix.normalize(posix.join(posix.dirname(path), specifier));
    if (!existsSync(join(root, resolved))) {
      fail(`없는 모듈을 import합니다: ${path} -> ${specifier}`);
    }
  }
}

const commentRules = [
  { test: (path) => /\.(js|mjs)$/.test(path), pattern: /^\s*(\/\/|\/\*|\*\s|\*\/)/ },
  { test: (path) => path.endsWith(".css"), pattern: /^\s*(\/\*|\*\/)/ },
  { test: (path) => path.endsWith(".sql"), pattern: /^\s*--/ },
  { test: (path) => path.endsWith(".html"), pattern: /^\s*<!--/ }
];

for (const path of allFiles) {
  if (path.startsWith("icons/") || path.endsWith(".md") || path.endsWith(".json")) {
    continue;
  }
  const rule = commentRules.find((item) => item.test(path));
  if (!rule) {
    continue;
  }
  const lines = read(path).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (rule.pattern.test(line)) {
      fail(`주석이 남아 있습니다: ${path}:${index + 1}`);
    }
  });
}

if (problems.length > 0) {
  console.error(`검사 실패 ${problems.length}건`);
  for (const problem of problems) {
    console.error(` - ${problem}`);
  }
  process.exit(1);
}

console.log(`검사 통과 · 파일 ${allFiles.length}개`);
console.log(`확장 이름 ${manifest.name} · 버전 ${manifest.version}`);
console.log(`확장 ID(고정) ${extensionId}`);
console.log(`확장 리디렉션 주소: https://${extensionId}.chromiumapp.org/supabase-auth 로 등록`);
console.log("웹 리디렉션 주소: https://<도메인>/auth/callback.html 로 등록");
