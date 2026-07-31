import { DomainError } from './errors.js';

/**
 * 把一項權限「委派」給原本沒有它的角色，並以可個別撤銷的授權碼把關。
 *
 * 需求來源（2026-07-27 負責人）：刪除預約原本只給管理者，但現場常常需要櫃台
 * 當下就處理，所以改成「櫃台要有授權碼才能刪」，授權碼由管理者自訂、**可以有
 * 多組、每一組都能單獨開關**。多組是重點：一位離職、一支被看到，就停掉那一組，
 * 不必換掉全部人的。
 *
 * **這裡定義的是規則，不是安全機制。** 現階段授權碼以明碼比對，與工作臺的合成
 * 登入同屬 AUTH-001 的「非安全邊界」——瀏覽器裡的東西使用者本來就看得到。真正
 * 的驗證政策（雜湊、伺服器端、與 IdP 綁定）已由 D-006 核准，但 Stage 2 C2～C4
 * 尚未實作。把規則放在 domain，是為了讓實作到來時只換比對與執行邊界，不重寫
 * 整套判斷。
 */

export interface DelegatedAuthorization {
  readonly id: string;
  /** 給人看的名字，例如「早班櫃台」。稽核紀錄會留這個，不留授權碼。 */
  readonly label: string;
  readonly secret: string;
  readonly enabled: boolean;
}

export interface DelegationPolicy {
  /** 被委派的權限，例如 delete_appointment。 */
  readonly permission: string;
  /** 委派給哪一個角色。 */
  readonly delegatedToRole: string;
  /** 總開關：關掉就等於整項委派收回，不必逐一停用授權碼。 */
  readonly enabled: boolean;
  readonly authorizations: readonly DelegatedAuthorization[];
}

export type DelegationDenialReason =
  | 'not_delegated_to_role'
  | 'delegation_disabled'
  | 'no_authorization_configured'
  | 'secret_required'
  | 'secret_not_recognised';

export type DelegationDecision =
  | {
      readonly authorised: true;
      readonly authorizationId: string;
      readonly authorizationLabel: string;
    }
  | { readonly authorised: false; readonly reason: DelegationDenialReason };

const MINIMUM_SECRET_LENGTH = 6;
const MAXIMUM_LABEL_LENGTH = 30;

/**
 * 判斷這一次委派使用是否成立。
 *
 * 呼叫端要先確認「這個人本來就沒有這項權限」——管理者自己動手不必走委派，也不該
 * 被要求輸入授權碼。
 */
export function authoriseDelegatedAction(
  policy: DelegationPolicy,
  actorRole: string,
  presentedSecret: unknown
): DelegationDecision {
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

  const match = usable.find((authorization) => authorization.secret === secret);

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

/**
 * 新增或更名一組授權碼時的驗證。
 *
 * 名稱必須可辨識：稽核紀錄留的是名稱，一堆「授權碼 1／2／3」等於沒有留。
 */
export function assertAuthorizationShape(
  label: unknown,
  secret: unknown
): { label: string; secret: string } {
  const trimmedLabel = typeof label === 'string' ? label.trim() : '';
  if (trimmedLabel === '' || trimmedLabel.length > MAXIMUM_LABEL_LENGTH)
    throw new DomainError(
      'INVALID_VALUE',
      `authorization label must be 1-${MAXIMUM_LABEL_LENGTH} characters`
    );

  const trimmedSecret = typeof secret === 'string' ? secret.trim() : '';
  if (trimmedSecret.length < MINIMUM_SECRET_LENGTH)
    throw new DomainError(
      'INVALID_VALUE',
      `authorization secret must be at least ${MINIMUM_SECRET_LENGTH} characters`
    );

  return { label: trimmedLabel, secret: trimmedSecret };
}

/**
 * 稽核用的委派紀錄。**永遠不含授權碼本身**——稽核紀錄會被匯出、列印、轉寄，
 * 把授權碼寫進去等於讓它從一條沒有人在看的路徑外流。
 */
export interface DelegationRecord {
  readonly delegated: true;
  readonly permission: string;
  readonly authorizationId: string;
  readonly authorizationLabel: string;
}

export function planDelegationRecord(
  policy: DelegationPolicy,
  decision: DelegationDecision
): DelegationRecord {
  if (!decision.authorised)
    throw new DomainError(
      'DELEGATION_NOT_AUTHORIZED',
      'a delegation record requires an authorised decision'
    );
  return {
    delegated: true,
    permission: policy.permission,
    authorizationId: decision.authorizationId,
    authorizationLabel: decision.authorizationLabel
  };
}
