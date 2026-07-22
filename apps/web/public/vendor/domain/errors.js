export class DomainError extends Error {
    code;
    name = 'DomainError';
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
