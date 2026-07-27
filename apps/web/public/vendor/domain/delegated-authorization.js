import { DomainError } from './errors.js';
const MINIMUM_SECRET_LENGTH = 6;
const MAXIMUM_LABEL_LENGTH = 30;
/**
 * 判斷這一次委派使用是否成立。
 *
 * 呼叫端要先確認「這個人本來就沒有這項權限」——管理者自己動手不必走委派，也不該
 * 被要求輸入授權碼。
 */
export function authoriseDelegatedAction(policy, actorRole, presentedSecret) {
    if (policy.delegatedToRole !== actorRole)
        return { authorised: false, reason: 'not_delegated_to_role' };
    if (!policy.enabled)
        return { authorised: false, reason: 'delegation_disabled' };
    const usable = policy.authorizations.filter((authorization) => authorization.enabled);
    if (usable.length === 0)
        return { authorised: false, reason: 'no_authorization_configured' };
    const secret = typeof presentedSecret === 'string' ? presentedSecret : '';
    if (secret === '')
        return { authorised: false, reason: 'secret_required' };
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
export function assertAuthorizationShape(label, secret) {
    const trimmedLabel = typeof label === 'string' ? label.trim() : '';
    if (trimmedLabel === '' || trimmedLabel.length > MAXIMUM_LABEL_LENGTH)
        throw new DomainError('INVALID_VALUE', `authorization label must be 1-${MAXIMUM_LABEL_LENGTH} characters`);
    const trimmedSecret = typeof secret === 'string' ? secret.trim() : '';
    if (trimmedSecret.length < MINIMUM_SECRET_LENGTH)
        throw new DomainError('INVALID_VALUE', `authorization secret must be at least ${MINIMUM_SECRET_LENGTH} characters`);
    return { label: trimmedLabel, secret: trimmedSecret };
}
export function planDelegationRecord(policy, decision) {
    if (!decision.authorised)
        throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'a delegation record requires an authorised decision');
    return {
        delegated: true,
        permission: policy.permission,
        authorizationId: decision.authorizationId,
        authorizationLabel: decision.authorizationLabel
    };
}
