export interface Auth {
    user: User;
    /** The signed-in user's creator application, if any. */
    creator: { handle: string; status: 'pending' | 'approved' | 'rejected'; adult_content: boolean } | null;
}

export interface SharedData {
    name: string;
    locale: 'mn' | 'en';
    quote: { message: string; author: string };
    auth: Auth;
    [key: string]: unknown;
}

export interface User {
    id: number;
    name: string;
    email: string;
    avatar_url: string | null;
    /** Money in the fan's wallet, in ₮. */
    wallet_balance: number;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}
