/**
 * Creates the first administrator account.
 *
 * The `handle_new_user` trigger creates every new profile as SUSPENDED, so
 * accounts made through normal signup cannot act until an owner activates
 * them. This script is the deliberate exception used to bootstrap the very
 * first owner, and it runs from your machine with the service role key rather
 * than being exposed anywhere in the web app.
 *
 * Usage:
 *   npm run create:admin -- --email you@example.com --name "Your Name" --role president
 *
 * You will be prompted for a password; it is never passed on the command line,
 * where it would end up in your shell history.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const VALID_ROLES = [
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'teacher_sponsor',
] as const;

type Role = (typeof VALID_ROLES)[number];

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  console.log(`\n${c.bold}${c.cyan}Club America — create an admin account${c.reset}\n`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const email = (arg('email') ?? (await rl.question('Email: '))).trim().toLowerCase();
    const fullName = (arg('name') ?? (await rl.question('Full name: '))).trim();
    const roleInput = (arg('role') ?? (await rl.question(`Role (${VALID_ROLES.join(' / ')}): `)))
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`"${email}" is not a valid email address.`);
    if (!fullName) fail('A full name is required.');
    if (!VALID_ROLES.includes(roleInput as Role)) {
      fail(`"${roleInput}" is not a valid role. Choose one of: ${VALID_ROLES.join(', ')}`);
    }

    const role = roleInput as Role;

    console.log(
      `\n${c.dim}Password must be at least 12 characters. Use something unique —\n` +
        `this account can publish to the public website.${c.reset}`
    );

    const password = await rl.question('Password: ');
    if (password.length < 12) fail('Password must be at least 12 characters.');

    const confirm = await rl.question('Confirm password: ');
    if (password !== confirm) fail('Passwords do not match.');

    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Is there already an owner? The first account created becomes the owner;
    // later ones do not, so this script cannot be used to seize control of an
    // established installation.
    const { data: existingOwner } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_owner', true)
      .maybeSingle();

    const isFirstOwner = !existingOwner;

    if (existingOwner) {
      console.log(
        `\n${c.yellow}Note:${c.reset} ${existingOwner.full_name} (${existingOwner.email}) is already ` +
          `the owner.\nThis new account will be a regular admin with full content permissions.\n` +
          `Ownership can be transferred from the Leadership Transfer page.`
      );
    }

    console.log(`\n${c.dim}Creating account...${c.reset}`);

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, status: 'active' },
    });

    if (createError || !created.user) {
      fail(`Could not create the account: ${createError?.message ?? 'unknown error'}`);
    }

    // Upsert rather than update: the auth.users trigger may not exist (Supabase
    // usually refuses to let us attach one), so the profile row may not be there
    // yet. This works either way.
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: created.user.id,
        full_name: fullName,
        email,
        role,
        status: 'active',
        is_owner: isFirstOwner,
        is_break_glass: role === 'teacher_sponsor',
        school_year_started: currentSchoolYear(),
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      fail(
        `The login was created but its profile could not be activated: ${profileError.message}\n` +
          `Fix the profiles row in Supabase, or delete the user and try again.`
      );
    }

    await supabase.from('audit_logs').insert({
      actor_name: fullName,
      actor_role: role,
      action: 'security',
      section: 'Accounts',
      summary: `Admin account created for ${fullName} (${email})${isFirstOwner ? ' as owner' : ''} via create:admin script`,
      entity_type: 'profile',
      entity_id: created.user.id,
    });

    console.log(`\n${c.green}${c.bold}Account created.${c.reset}\n`);
    console.log(`  Name   ${fullName}`);
    console.log(`  Email  ${email}`);
    console.log(`  Role   ${role.replace(/_/g, ' ')}`);
    console.log(`  Owner  ${isFirstOwner ? 'yes' : 'no'}`);
    if (role === 'teacher_sponsor') {
      console.log(
        `  ${c.dim}Break-glass enabled: this account keeps recovery access even after\n` +
          `  ownership moves to a new student president.${c.reset}`
      );
    }
    console.log(`\nSign in at /login\n`);
  } finally {
    rl.close();
  }
}

/** "2026-2027" — the school year runs August to July. */
function currentSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function fail(message: string): never {
  console.error(`\n${c.red}${c.bold}Aborted${c.reset}\n${message}\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n${c.red}Unexpected error:${c.reset}`, err);
  process.exit(1);
});
