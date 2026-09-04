import { DropboxAuth } from 'dropbox';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const code = process.argv[2]?.trim();
if (!code) {
    console.error('Usage: node scripts/exchange-dropbox-code.mjs <AUTHORIZATION_CODE>');
    process.exit(1);
}

const appKey = process.env.DROPBOX_APP_KEY;
const appSecret = process.env.DROPBOX_APP_SECRET;

if (!appKey || !appSecret) {
    console.error('Missing DROPBOX_APP_KEY or DROPBOX_APP_SECRET in .env');
    process.exit(1);
}

const auth = new DropboxAuth({ clientId: appKey, clientSecret: appSecret });

async function run() {
    console.log('Exchanging authorization code with Dropbox...');
    try {
        const response = await auth.getAccessTokenFromCode('', code);
        const refreshToken = response.result.refresh_token;
        
        if (!refreshToken) {
            console.error('Warning: No refresh_token returned. Did you include token_access_type=offline?');
            console.log('Result:', response.result);
            process.exit(1);
        }

        console.log('Successfully acquired refresh token!');
        
        for (const envFile of ['.env', '.env.local']) {
            const fullPath = path.resolve(process.cwd(), envFile);
            if (fs.existsSync(fullPath)) {
                let content = fs.readFileSync(fullPath, 'utf8');
                content = content.replace(/DROPBOX_REFRESH_TOKEN=.*/g, `DROPBOX_REFRESH_TOKEN=${refreshToken}`);
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${envFile}`);
            }
        }

        console.log('Testing connection with new refresh token...');
        const { Dropbox } = await import('dropbox');
        const dbx = new Dropbox({ clientId: appKey, clientSecret: appSecret, refreshToken });
        const acc = await dbx.usersGetCurrentAccount();
        console.log(`Connected! Account: ${acc.result.name.display_name} (${acc.result.email})`);
    } catch (err) {
        console.error('Exchange failed:', err?.error?.error_description || err?.error || err?.message || err);
        process.exit(1);
    }
}

run();
