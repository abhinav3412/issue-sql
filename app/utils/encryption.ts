import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-byte-key-placeholder-32';
// Ensure the key is exactly 32 bytes for AES-256-CBC
const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
const IV_LENGTH = 16;

export function encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    if (!text) return '';
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export function maskValue(value: string, visibleSuffixLen: number = 4): string {
    if (!value) return '';
    if (value.length <= visibleSuffixLen) return value;
    const maskedLength = value.length - visibleSuffixLen;
    return 'X'.repeat(maskedLength) + value.slice(-visibleSuffixLen);
}
