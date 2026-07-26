import process from 'node:process';

// 分支保護是整套證據設計的最後一哩：verify.yml 會跑、evidence job 會在任一上游
// 失敗時 exit 1，但**只有 GitHub 端把它設為 required**，紅燈才真的擋得住合併。
// 那個設定在網頁介面裡，版控看不到，所以它是這個專案唯一「靠記憶」的把關。
//
// 這支腳本把它變成可查證的。它不在 `verify` 裡：需要網路與一組有 admin 讀取
// 權的 token，而 verify 必須離線可跑。用法：
//
//   $env:GITHUB_TOKEN = '<PAT，需 repo 的 administration:read>'
//   corepack pnpm run check:branch-protection
//
// 沒有 token 時回離開碼 2（「沒查」），不是 0——「查不到」絕不能長得像「通過」。

const REPOSITORY = process.env.BRANCH_PROTECTION_REPO ?? 'waydefu/clinic';
const BRANCH = process.env.BRANCH_PROTECTION_BRANCH ?? 'main';
// 注意是 job 的 `name:` 而不是 job id。verify.yml 的 job id 是 `evidence`，但它
// 設了 `name: Verification evidence`，而 GitHub 的 status check context 用的是
// 顯示名稱——拿 job id 去設必要檢查會設到一個永遠不會出現的名字。
const REQUIRED_CHECKS = (
  process.env.BRANCH_PROTECTION_CHECKS ?? 'Verification evidence'
)
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value !== '');

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (token === undefined) {
  console.error(
    'No GITHUB_TOKEN/GH_TOKEN in the environment, so branch protection was NOT checked.'
  );
  console.error(
    `手動確認路徑：https://github.com/${REPOSITORY}/settings/branches → ${BRANCH} → ` +
      'Require status checks to pass before merging → 清單中必須有：' +
      REQUIRED_CHECKS.join('、')
  );
  process.exit(2);
}

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'beauessence-branch-protection-check/1',
      'x-github-api-version': '2022-11-28'
    }
  });
  return { status: response.status, body: await response.text() };
}

/** classic branch protection 與 ruleset 兩種設定方式都要看，任一達成即可。 */
const protection = await api(
  `/repos/${REPOSITORY}/branches/${BRANCH}/protection`
);
const rulesets = await api(`/repos/${REPOSITORY}/rules/branches/${BRANCH}`);

const enforced = new Set();

if (protection.status === 200) {
  const parsed = JSON.parse(protection.body);
  for (const check of parsed.required_status_checks?.checks ?? [])
    enforced.add(check.context);
  for (const context of parsed.required_status_checks?.contexts ?? [])
    enforced.add(context);
} else if (protection.status !== 404) {
  console.error(
    `Reading branch protection failed with HTTP ${protection.status}.` +
      ' token 需要該 repo 的 administration:read。'
  );
  process.exit(2);
}

if (rulesets.status === 200) {
  for (const rule of JSON.parse(rulesets.body)) {
    if (rule.type !== 'required_status_checks') continue;
    for (const check of rule.parameters?.required_status_checks ?? [])
      enforced.add(check.context);
  }
}

const missing = REQUIRED_CHECKS.filter((check) => !enforced.has(check));
if (missing.length > 0) {
  console.error(
    `${REPOSITORY}@${BRANCH}：以下檢查沒有被設為必要 → ${missing.join('、')}`
  );
  console.error(
    `目前必要的檢查：${enforced.size === 0 ? '（一個都沒有）' : [...enforced].join('、')}`
  );
  console.error(
    'CI 會照跑、紅燈會顯示，但沒有任何東西阻止把紅的合併進 main——整套證據設計到這裡才生效。'
  );
  process.exitCode = 1;
} else {
  console.log(
    `Branch protection OK：${REPOSITORY}@${BRANCH} 必要檢查包含 ${REQUIRED_CHECKS.join('、')}。`
  );
}
