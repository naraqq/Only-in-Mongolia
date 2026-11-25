import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';

/**
 * UI text in English and Mongolian. Mongolian is the default (APP_LOCALE=mn); the МН/EN switch stores the
 * choice in the session. Add every new key to both dictionaries: `mn` is typed against `en`.
 */
const en = {
    'lang.label': 'Language',

    // Phone login (verify.mn)
    'ph.title': 'Log in or sign up',
    'ph.sub': 'Use your mobile number. No password needed.',
    'ph.phone': 'Mobile number',
    'ph.continue': 'Continue',
    'ph.or': 'or',
    'ph.email': 'Log in with email',
    'ph.stepTitle': 'Confirm your number by SMS',
    'ph.stepSub': 'Send the code below from your phone. We confirm it automatically.',
    'ph.code': 'Code',
    'ph.to': 'Send to',
    'ph.send': 'Open SMS app and send',
    'ph.desktop': 'On a computer? Send this SMS from your phone, from the number above (not another SIM).',
    'ph.cost': 'Your operator charges 150₮ per SMS. Send it only once.',
    'ph.waiting': 'Waiting for your SMS…',
    'ph.expiresIn': 'Code valid for {time}',
    'ph.change': 'Change number',
    'ph.verified': 'Number confirmed! Signing you in…',
    'ph.expired': "This code has expired and is no longer valid. Please don't send it; get a new code instead.",
    'ph.newCode': 'Get a new code',
    'ph.nameTitle': 'Welcome! What should we call you?',
    'ph.nameSub': 'Number {phone} is confirmed. This is the name people will see.',
    'ph.name': 'Your name',
    'ph.namePh': 'e.g. Bat-Erdene',
    'ph.create': 'Create my account',
    'ph.why': 'Every account is tied to a real Mongolian phone number, which keeps fake accounts out.',
};

export type TKey = keyof typeof en;

const mn: Record<TKey, string> = {
    'lang.label': 'Хэл',

    'ph.title': 'Нэвтрэх эсвэл бүртгүүлэх',
    'ph.sub': 'Гар утасны дугаараа ашиглана. Нууц үг хэрэггүй.',
    'ph.phone': 'Гар утасны дугаар',
    'ph.continue': 'Үргэлжлүүлэх',
    'ph.or': 'эсвэл',
    'ph.email': 'Имэйлээр нэвтрэх',
    'ph.stepTitle': 'Дугаараа SMS-ээр баталгаажуулна уу',
    'ph.stepSub': 'Доорх кодыг утаснаасаа илгээнэ үү. Бид автоматаар шалгана.',
    'ph.code': 'Код',
    'ph.to': 'Хүлээн авах дугаар',
    'ph.send': 'SMS илгээх',
    'ph.desktop': 'Компьютер дээр байна уу? Энэ SMS-ийг утаснаасаа, дээрх дугаараас (өөр SIM-ээс биш) илгээнэ үү.',
    'ph.cost': 'Оператор SMS тутамд 150₮ авна. Зөвхөн нэг удаа илгээнэ үү.',
    'ph.waiting': 'Таны SMS-ийг хүлээж байна…',
    'ph.expiresIn': 'Код хүчинтэй: {time}',
    'ph.change': 'Дугаар солих',
    'ph.verified': 'Дугаар баталгаажлаа! Нэвтэрч байна…',
    'ph.expired': 'Энэ кодын хугацаа дууссан тул хүчингүй. Дахин бүү илгээгээрэй, шинэ код авна уу.',
    'ph.newCode': 'Шинэ код авах',
    'ph.nameTitle': 'Тавтай морил! Таныг хэн гэж дуудах вэ?',
    'ph.nameSub': '{phone} дугаар баталгаажлаа. Энэ нэр бусдад харагдана.',
    'ph.name': 'Таны нэр',
    'ph.namePh': 'ж: Бат-Эрдэнэ',
    'ph.create': 'Бүртгэл үүсгэх',
    'ph.why': 'Бүртгэл бүр бодит монгол утасны дугаартай холбогддог тул хуурамч бүртгэл үүсгэх боломжгүй.',
};

const DICTS = { en, mn } as const;
export type Locale = keyof typeof DICTS;

/** Translate without a hook. Falls back to English, then the raw key, so it never crashes. */
export function translate(locale: string | undefined, key: string, vars: Record<string, string | number> = {}): string {
    const dict: Record<string, string> = DICTS[(locale ?? 'mn') as Locale] ?? mn;
    const text = dict[key] ?? (en as Record<string, string>)[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function useT() {
    const locale = (usePage<SharedData>().props.locale ?? 'mn') as Locale;
    const t = (key: TKey, vars: Record<string, string | number> = {}) => translate(locale, key, vars);
    return { t, locale };
}

export function setLocale(locale: Locale) {
    router.post(route('locale', locale), {}, { preserveScroll: true });
}
