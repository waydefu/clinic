import { DomainError } from './errors.js';
import type { Role } from './roles.js';
import type { DelegationDecision as CommonDelegationDecision } from './delegated-authorization-common.js';

export {
  assertAuthorizationShape,
  planDelegationRecord
} from './delegated-authorization-common.js';
export type {
  DelegationDecision,
  DelegationDenialReason,
  DelegationRecord
} from './delegated-authorization-common.js';

/**
 * 把一項權限「委派」給原本沒有它的角色，並以可個別撤銷的授權碼把關。
 *
 * 需求來源（2026-07-27 負責人）：刪除預約原本只給管理者，但現場常常需要櫃台
 * 當下就處理，所以改成「櫃台要有授權碼才能刪」，授權碼由管理者自訂、**可以有
 * 多組、每一組都能單獨開關**。多組是重點：一位離職、一支被看到，就停掉那一組，
 * 不必換掉全部人的。
 *
 * **這裡定義的是規則，不是安全機制。** 授權碼只以 `secretSalt` 與 `secretHash`
 * 形式存在；明碼只在輸入驗證與 server adapter 的短暫記憶體中出現。真正的 KDF、
 * constant-time 比對、server-side session 與 IdP 綁定由 API 邊界負責。
 * Stage 2 C2～C4 尚未接到 route。把規則放在 domain，是為了讓實作到來時只換
 * 比對與執行邊界，不重寫整套判斷。
 */

export interface DelegatedAuthorization {
  readonly id: string;
  /** 給人看的名字，例如「早班櫃台」。稽核紀錄會留這個，不留授權碼。 */
  readonly label: string;
  /** KDF 演算法版本由 server adapter 解讀；domain 不實作密碼學。 */
  readonly secretKdf: 'scrypt';
  /** 每組授權碼獨立 salt 的 base64url 編碼，不是明碼。 */
  readonly secretSalt: string;
  /** KDF 結果的 base64url 編碼，不是明碼。 */
  readonly secretHash: string;
  readonly enabled: boolean;
}

export interface DelegationPolicy {
  /** 被委派的權限，例如 delete_appointment。 */
  readonly permission: string;
  /** 委派給哪一個 canonical 角色。 */
  readonly delegatedToRole: Role;
  /** 總開關：關掉就等於整項委派收回，不必逐一停用授權碼。 */
  readonly enabled: boolean;
  readonly authorizations: readonly DelegatedAuthorization[];
}

export type DelegatedSecretVerifier = (
  authorization: DelegatedAuthorization,
  presentedSecret: string
) => boolean;

export interface DelegationVerificationState {
  readonly failedAttempts: number;
  readonly locked: boolean;
}

export type DelegationAttemptResult = 'success' | 'failure';

/**
 * Calculates the next attempt state. Persistence, actor/purpose keying and
 * manager-mediated unlock belong to the server/application boundary. The
 * caller must provide the reviewed maximum; the domain refuses values outside
 * the NIST-derived 1–10 safety range rather than guessing a product policy.
 */
export function recordDelegationAttempt(
  state: DelegationVerificationState,
  result: DelegationAttemptResult,
  maximumFailures: number
): DelegationVerificationState {
  if (
    !Number.isInteger(maximumFailures) ||
    maximumFailures < 1 ||
    maximumFailures > 10
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'maximum delegation failures must be an integer from 1 to 10'
    );
  }
  if (
    !Number.isInteger(state.failedAttempts) ||
    state.failedAttempts < 0 ||
    state.failedAttempts > maximumFailures ||
    (state.failedAttempts === maximumFailures && !state.locked)
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'delegation attempt state is invalid'
    );
  }
  if (state.locked) return state;
  if (result === 'success') return { failedAttempts: 0, locked: false };

  const failedAttempts = state.failedAttempts + 1;
  return {
    failedAttempts,
    locked: failedAttempts >= maximumFailures
  };
}

/**
 * 判斷這一次委派使用是否成立。
 *
 * 呼叫端要先確認「這個人本來就沒有這項權限」——管理者自己動手不必走委派，也不該
 * 被要求輸入授權碼。
 */
export function authoriseDelegatedAction(
  policy: DelegationPolicy,
  actorRole: Role,
  presentedSecret: unknown,
  verifySecret: DelegatedSecretVerifier
): CommonDelegationDecision {
  if (policy.delegatedToRole !== actorRole)
    return { authorised: false, reason: 'not_delegated_to_role' };
  if (!policy.enabled)
    return { authorised: false, reason: 'delegation_disabled' };

  const usable = policy.authorizations.filter(
    (authorization) => authorization.enabled
  );
  if (usable.length === 0)
    return { authorised: false, reason: 'no_authorization_configured' };

  const secret = typeof presentedSecret === 'string' ? presentedSecret : '';
  if (secret === '') return { authorised: false, reason: 'secret_required' };

  const match = usable.find((authorization) =>
    verifySecret(authorization, secret)
  );

  // 停用的授權碼一律當作不存在。
  //
  // 若對「輸入了一組已停用的授權碼」回報不同的原因，等於告訴對方「這組是真的，
  // 只是被關掉了」——那正是被撤銷的那個人最想知道的事。因此比對只在啟用中的
  // 集合裡進行，未命中一律回同一個原因。
  if (match === undefined)
    return { authorised: false, reason: 'secret_not_recognised' };

  return {
    authorised: true,
    authorizationId: match.id,
    authorizationLabel: match.label
  };
}
