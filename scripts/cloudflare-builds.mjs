// Connect this repo to Cloudflare Workers Builds, so a push to main deploys
// and other branches get preview URLs, without clicking through the dashboard.
// Idempotent: rerun it after changing the settings below. See docs/cloudflare.md.
//
//   op run --env-file=.env -- npm run cf:builds              # apply
//   op run --env-file=.env -- npm run cf:builds -- --tokens  # list build tokens
//
// Environment (keep secrets in 1Password; .env holds op:// references):
//   CLOUDFLARE_API_TOKEN   token with Workers Builds Configuration: Edit
//   CLOUDFLARE_ACCOUNT_ID  the account that owns the Worker
//   BUILD_TOKEN_UUID       which build token deploys use (list with --tokens)
//
// The Worker must already exist: Workers Builds attaches to a Worker, it
// doesn't create one. The first `npx wrangler deploy` creates it (and attaches
// the custom domain in wrangler.jsonc), and is a production deploy.
import { execFileSync } from 'node:child_process';
import { SITE_HOST } from '../web/site.ts';

const WORKER_NAME = 'markdown-to-word-js';
const REPO = 'benbalter/markdown-to-word-js';
const BRANCH = 'main';

// Matches the CLAUDE.md promise that a production deploy has passed the tests.
const BUILD_COMMAND = 'npm run build && npm test';
// Pushes that can't change the site don't start a build.
const PATH_EXCLUDES = [
  '.github/**',
  'docs/**',
  'test/e2e/**',
  'README.md',
  'CONTRIBUTING.md',
  'CLAUDE.md',
];

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, BUILD_TOKEN_UUID } =
  process.env;
if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error(
    'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (e.g. op run --env-file=.env -- npm run cf:builds).'
  );
  process.exit(1);
}

const api = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}`;

async function cf(method, path, body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, ok: json.success === true, ...json };
}

function fail(message, result) {
  console.error(`✗ ${message}`);
  if (result?.errors?.length) console.error(result.errors);
  process.exit(1);
}

if (process.argv.includes('--tokens')) {
  const tokens = await cf('GET', '/builds/tokens');
  if (!tokens.ok) fail('Could not list build tokens', tokens);
  for (const t of tokens.result) {
    console.log(`${t.build_token_uuid}  ${t.build_token_name}`);
  }
  process.exit(0);
}

if (!BUILD_TOKEN_UUID) {
  fail('Set BUILD_TOKEN_UUID (list them with: npm run cf:builds -- --tokens)');
}

// The Worker's tag (not its name) identifies it to the Builds API.
const scripts = await cf('GET', '/workers/scripts');
if (!scripts.ok) fail('Could not list Workers', scripts);
const worker = scripts.result.find((s) => s.id === WORKER_NAME);
if (!worker) {
  fail(
    `No Worker named ${WORKER_NAME} yet. Create it with a first \`npx wrangler deploy\` (a production deploy to the domain in wrangler.jsonc), then rerun.`
  );
}

// GitHub's numeric ids for the repo and its owner, which the API wants.
const repo = JSON.parse(
  execFileSync('gh', ['api', `repos/${REPO}`], { encoding: 'utf8' })
);

const settings = {
  build_command: BUILD_COMMAND,
  deploy_command: 'npx wrangler deploy',
  build_token_uuid: BUILD_TOKEN_UUID,
  build_caching_enabled: true,
  root_directory: '/',
  path_includes: ['*'],
  path_excludes: PATH_EXCLUDES,
};
// Branch builds create a Worker Preview instead of deploying. Needs the
// `previews` block in wrangler.jsonc.
const previewSettings = {
  ...settings,
  deploy_command: 'npx wrangler preview',
};

const existing = await cf('GET', `/builds/workers/${worker.tag}`);
let result;
if (existing.ok && existing.result) {
  result = await cf('PATCH', `/builds/workers/${worker.tag}`, {
    git_repository: { branch: BRANCH },
    production_settings: settings,
    previews_enabled: true,
    previews_base_config: previewSettings,
  });
} else {
  result = await cf('POST', '/builds/workers', {
    script_tag: worker.tag,
    git_repository: {
      provider_type: 'github',
      provider_account_id: String(repo.owner.id),
      provider_account_name: repo.owner.login,
      repo_id: String(repo.id),
      repo_name: repo.name,
      branch: BRANCH,
    },
    production_settings: settings,
    previews_enabled: true,
    previews_base_config: previewSettings,
  });
}
if (!result.ok) {
  fail(
    'Could not save the build configuration. If the error mentions the repository, install the Cloudflare Workers and Pages GitHub app on the repo first (a one-time authorization).',
    result
  );
}

console.log(
  `✓ ${WORKER_NAME}: pushes to ${BRANCH} build with "${BUILD_COMMAND}" and deploy to ${SITE_HOST}; other branches get preview URLs.`
);
