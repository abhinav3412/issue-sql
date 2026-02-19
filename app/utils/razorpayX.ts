import Razorpay from 'razorpay';

const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Razorpay Payouts (RazorpayX) endpoints often require basic auth and a specific body.
// The Payouts API is a bit different from the standard payments API.

export async function createRazorpayContact(data: { name: string; email: string; contact: string }) {
    try {
        const response = await fetch('https://api.razorpay.com/v1/contacts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64'),
            },
            body: JSON.stringify({
                name: data.name,
                email: data.email,
                contact: data.contact,
                type: 'vendor', // Workers are vendors receiving payouts
            }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.description || 'Failed to create contact');
        return result;
    } catch (error: any) {
        console.error('Razorpay Contact Error:', error);
        throw error;
    }
}

export async function createRazorpayFundAccount(contact_id: string, bank_details: { name: string; ifsc: string; account_number: string }) {
    try {
        const response = await fetch('https://api.razorpay.com/v1/fund_accounts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64'),
            },
            body: JSON.stringify({
                contact_id,
                account_type: 'bank_account',
                bank_account: {
                    name: bank_details.name,
                    ifsc: bank_details.ifsc,
                    account_number: bank_details.account_number,
                },
            }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.description || 'Failed to create fund account');
        return result;
    } catch (error: any) {
        console.error('Razorpay Fund Account Error:', error);
        throw error;
    }
}

export async function createRazorpayPayout(data: { fund_account_id: string; amount: number; reference_id: string }) {
    try {
        const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER || '';

        // Check if RazorpayX is properly configured
        const isTestMode = !accountNumber ||
            accountNumber === 'your_razorpayx_account_number_here' ||
            accountNumber.length < 10;

        if (isTestMode) {
            // Mock payout for testing when RazorpayX is not configured
            console.warn('⚠️  RazorpayX not configured - Using MOCK payout mode');
            console.log('Mock Payout:', {
                fund_account_id: data.fund_account_id,
                amount: data.amount,
                reference_id: data.reference_id,
                note: 'This is a simulated payout. Configure RAZORPAY_ACCOUNT_NUMBER in .env for real payouts'
            });

            return {
                id: `mock_payout_${Date.now()}`,
                entity: 'payout',
                fund_account_id: data.fund_account_id,
                amount: Math.round(data.amount * 100),
                currency: 'INR',
                status: 'processing',
                purpose: 'payout',
                mode: 'IMPS',
                reference_id: data.reference_id,
                narration: 'Mock payout - RazorpayX not configured',
                created_at: Math.floor(Date.now() / 1000)
            };
        }

        // Real RazorpayX payout
        // Amount should be in paise for Razorpay
        const payoutBody = {
            account_number: accountNumber,
            fund_account_id: data.fund_account_id,
            amount: Math.round(data.amount * 100),
            currency: 'INR',
            mode: 'IMPS',
            purpose: 'payout',
            queue_if_low_balance: true,
            reference_id: data.reference_id,
            notes: {
                type: 'worker_settlement'
            }
        };

        const response = await fetch('https://api.razorpay.com/v1/payouts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64'),
            },
            body: JSON.stringify(payoutBody),
        });
        const result = await response.json();
        if (!response.ok) {
            console.error('Razorpay Payout Error Response:', {
                status: response.status,
                statusText: response.statusText,
                error: result,
                requestBody: {
                    ...payoutBody,
                    account_number: '***masked***'
                }
            });
            throw new Error(result.error?.description || 'Failed to create payout');
        }
        return result;
    } catch (error: any) {
        console.error('Razorpay Payout Error:', error);
        throw error;
    }
}
