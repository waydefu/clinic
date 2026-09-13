import { DomainError } from './errors.js';
export { assertAuthorizationShape, planDelegationRecord } from './delegated-authorization-common.js';
/**
 * Calculates the next attempt state. Persistence, actor/purpose keying and
 * manager-mediated unlock belong to the server/application boundary. The
 * caller must provide the reviewed maximum; the domain refuses values outside
 * the NIST-derived 1–10 safety range rather than guessing a product policy.
 */
export function recordDelegationAttempt(state, result, maximumFailures) {
    if (!Number.isInteger(maximumFailures) ||
        maximumFailures < 1 ||
        maximumFailures > 10) {
        throw new DomainError('INVALID_VALUE', 'maximum delegation failures must be an integer from 1 to 10');
    }
    if (!Number.isInteger(state.failedAttempts) ||
        state.failedAttempts < 0 ||
        state.failedAttempts > maximumFailures ||
        (state.failedAttempts === maximumFailures && !state.locked)) {
        throw new DomainError('INVALID_VALUE', 'delegation attempt state is invalid');
    }
    if (state.locked)
        return state;
    if (result === 'success')
        return { failedAttempts: 0, locked: false };
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
export function authoriseDelegatedAction(policy, actorRole, presentedSecret, verifySecret) {
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
    const match = usable.find((authorization) => verifySecret(authorization, secret));
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
