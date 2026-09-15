import { fromCalendarEventId, isCalendarEventId } from './calendar-event-id.js';
import { CALENDAR_ENTRY_SEPARATOR } from './calendar-sync.js';
import { SLOT_MINUTE_MARKS } from './schedule.js';
/**
 * Clinic Calendar projection allowlist and loop-prevention markers.
 *
 * Internal preproduction may carry synthetic operational fields. Forbidden
 * clinical, identity-document and money fields must never appear on the
 * Calendar payload. ADR-0002 still forbids emitting patient name/phone from
 * the clinic outbound adapter; they remain on the allowlist so a future
 * closed synthetic format can add them without silently introducing DOB or
 * diagnosis.
 */
export const CALENDAR_PROJECTION_SOURCE = 'clinic_db';
export const CALENDAR_LINK_PROPERTY = 'beauessenceLinkId';
export const CALENDAR_SOURCE_PROPERTY = 'beauessenceSource';
export const CALENDAR_PROJECTION_VERSION_PROPERTY = 'beauessenceProjectionVersion';
export const CALENDAR_WRITE_CORRELATION_PROPERTY = 'beauessenceWriteCorrelationId';
export const CALENDAR_STATUS_PROPERTY = 'beauessenceAppointmentStatus';
export const CALENDAR_ALLOWED_EVENT_KEYS = Object.freeze([
    'id',
    'summary',
    'description',
    'location',
    'colorId',
    'start',
    'end',
    'extendedProperties'
]);
export const CALENDAR_ALLOWED_OPERATIONAL_FIELDS = Object.freeze([
    'appointmentId',
    'bookingKind',
    'scheduledTime',
    'operationalStatus',
    'syntheticPatientCode',
    'syntheticDisplayName',
    'syntheticPhone',
    'serviceLabel',
    'clinicName',
    'location'
]);
export const CALENDAR_FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
    'dateOfBirth',
    'dob',
    'nationalId',
    'nationalID',
    'idNumber',
    'passport',
    'passportNumber',
    'diagnosis',
    'clinicalNotes',
    'medicalNotes',
    'medicalFreeText',
    'anesthesia',
    'anesthesiaDetails',
    'payment',
    'paymentAmount',
    'settlement',
    'settlementAmount',
    'fee',
    'price'
]);
export const CALENDAR_INBOUND_MUTABLE_FIELDS = Object.freeze([
    'startsAt',
    'endsAt',
    'operationalStatus'
]);
const BOOKING_KIND_LABEL = Object.freeze({
    initial: '初診',
    follow_up: '回診'
});
const OPERATIONAL_STATUS_PREFIX = Object.freeze({
    arrived: '✅到診',
    completed: '✅完成'
});
export function clinicBookingKindLabel(bookingKind) {
    if (bookingKind === 'initial' || bookingKind === 'follow_up')
        return BOOKING_KIND_LABEL[bookingKind];
    return '';
}
export function clinicProjectionVersion(input) {
    return `${input.appointmentId}:${input.appointmentStatus}:${input.startsAt}`;
}
export function formatClinicCalendarSummary(input) {
    const kindLabel = clinicBookingKindLabel(input.bookingKind);
    const base = kindLabel === ''
        ? input.clinicName.trim()
        : `${input.clinicName.trim()} ${kindLabel}`.trim();
    const prefix = OPERATIONAL_STATUS_PREFIX[input.appointmentStatus];
    if (prefix === undefined)
        return base;
    return `${prefix}${CALENDAR_ENTRY_SEPARATOR}${input.clinicName.trim()}${CALENDAR_ENTRY_SEPARATOR}${kindLabel}`;
}
export function buildClinicCalendarEventBody(input) {
    return {
        id: input.eventId,
        summary: formatClinicCalendarSummary({
            clinicName: input.clinicName,
            bookingKind: input.bookingKind,
            appointmentStatus: input.appointmentStatus
        }),
        description: `預約編號 ${input.appointmentId}`,
        location: input.clinicAddress,
        colorId: input.colorId,
        start: { dateTime: input.startsAt, timeZone: 'Asia/Taipei' },
        end: { dateTime: input.endsAt, timeZone: 'Asia/Taipei' },
        extendedProperties: {
            private: {
                [CALENDAR_LINK_PROPERTY]: input.appointmentId,
                [CALENDAR_SOURCE_PROPERTY]: CALENDAR_PROJECTION_SOURCE,
                [CALENDAR_PROJECTION_VERSION_PROPERTY]: clinicProjectionVersion({
                    appointmentId: input.appointmentId,
                    appointmentStatus: input.appointmentStatus,
                    startsAt: input.startsAt
                }),
                [CALENDAR_WRITE_CORRELATION_PROPERTY]: input.correlationId,
                [CALENDAR_STATUS_PROPERTY]: input.appointmentStatus
            }
        }
    };
}
function collectKeys(value, keys) {
    if (Array.isArray(value)) {
        for (const item of value)
            collectKeys(item, keys);
        return;
    }
    if (value === null || typeof value !== 'object')
        return;
    for (const [key, nested] of Object.entries(value)) {
        keys.add(key);
        collectKeys(nested, keys);
    }
}
export function calendarPayloadForbiddenKeys(payload) {
    const keys = new Set();
    collectKeys(payload, keys);
    return CALENDAR_FORBIDDEN_PAYLOAD_KEYS.filter((key) => keys.has(key));
}
export function calendarPayloadUsesAllowlistedEventKeys(payload) {
    const allowed = new Set(CALENDAR_ALLOWED_EVENT_KEYS);
    return Object.keys(payload).every((key) => allowed.has(key));
}
export function assertClinicCalendarPayloadAllowlist(payload) {
    if (!calendarPayloadUsesAllowlistedEventKeys(payload)) {
        throw new Error('Calendar payload contains a key outside the event allowlist.');
    }
    const forbidden = calendarPayloadForbiddenKeys(payload);
    if (forbidden.length > 0) {
        throw new Error(`Calendar payload contains forbidden fields: ${forbidden.join(', ')}.`);
    }
}
export function privateCalendarProperty(event, name) {
    const value = event.extendedProperties?.private?.[name];
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
export function extractCalendarEventRange(event) {
    const start = event.start?.dateTime;
    const end = event.end?.dateTime;
    if (typeof start !== 'string' || typeof end !== 'string')
        return undefined;
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs)
        return undefined;
    return {
        startsAt: new Date(startMs).toISOString(),
        endsAt: new Date(endMs).toISOString()
    };
}
export function calendarLogicalKeyKind(logicalKey) {
    if (logicalKey.startsWith('calendar_followup_'))
        return 'follow_up_reminder';
    if (logicalKey.startsWith('calendar_'))
        return 'appointment';
    return undefined;
}
export function appointmentIdFromLogicalCalendarKey(logicalKey) {
    if (logicalKey.startsWith('calendar_followup_'))
        return logicalKey.slice('calendar_followup_'.length) || undefined;
    if (logicalKey.startsWith('calendar_'))
        return logicalKey.slice('calendar_'.length) || undefined;
    return undefined;
}
export function resolveCalendarEventIdentity(event) {
    const linkId = privateCalendarProperty(event, CALENDAR_LINK_PROPERTY);
    if (isCalendarEventId(event.id)) {
        try {
            const logicalKey = fromCalendarEventId(event.id);
            const logicalKind = calendarLogicalKeyKind(logicalKey);
            const appointmentId = appointmentIdFromLogicalCalendarKey(logicalKey);
            return {
                ...(appointmentId === undefined ? {} : { appointmentId }),
                ...(logicalKind === undefined ? {} : { logicalKind }),
                ...(linkId === undefined ? {} : { linkId })
            };
        }
        catch {
            return linkId === undefined ? {} : { linkId, appointmentId: linkId };
        }
    }
    return linkId === undefined ? {} : { linkId, appointmentId: linkId };
}
export function isSelfProjectedCalendarEcho(input) {
    const source = privateCalendarProperty(input.event, CALENDAR_SOURCE_PROPERTY);
    const version = privateCalendarProperty(input.event, CALENDAR_PROJECTION_VERSION_PROPERTY);
    const linkId = privateCalendarProperty(input.event, CALENDAR_LINK_PROPERTY);
    const status = privateCalendarProperty(input.event, CALENDAR_STATUS_PROPERTY);
    const range = extractCalendarEventRange(input.event);
    const expected = clinicProjectionVersion({
        appointmentId: input.appointmentId,
        appointmentStatus: input.appointmentStatus,
        startsAt: input.startsAt
    });
    return (source === CALENDAR_PROJECTION_SOURCE &&
        linkId === input.appointmentId &&
        version === expected &&
        status === input.appointmentStatus &&
        range?.startsAt === input.startsAt);
}
function taipeiMinute(iso) {
    return new Date(Date.parse(iso) + 8 * 60 * 60 * 1000).getUTCMinutes();
}
export function isOnBookingKindGrid(startsAt, bookingKind) {
    if (Number.isNaN(Date.parse(startsAt)))
        return false;
    return SLOT_MINUTE_MARKS[bookingKind].includes(taipeiMinute(startsAt));
}
export function inboundFieldAllowlist(changed) {
    const allowed = [];
    const ignored = [];
    for (const field of changed) {
        if (CALENDAR_INBOUND_MUTABLE_FIELDS.includes(field)) {
            allowed.push(field);
        }
        else
            ignored.push(field);
    }
    return { allowed, ignored };
}
