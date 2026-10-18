#!/usr/bin/env node

/**
 * Moodle Radar - Telegram Webhook & Commands Setup Utility
 * Specification Reference: specs/04-telegram-bot-spec.md Section 1 & Section 2
 *
 * Configures the Telegram Bot API Webhook pointing to Supabase Edge Function
 * and registers Arabic bot command menus.
 *
 * Usage:
 *   node scripts/setup-telegram-webhook.mjs [options]
 *
 * Options:
 *   --token <bot_token>        Telegram Bot Token (default: env.TELEGRAM_BOT_TOKEN)
 *   --url <supabase_url>       Supabase Project URL (default: env.SUPABASE_URL)
 *   --secret <secret_token>    Webhook Secret Token (default: env.TELEGRAM_WEBHOOK_SECRET)
 *   --check-only               Only check current webhook status without modifying
 *   --delete                   Delete webhook and switch back to getUpdates polling
 *
 * Examples:
 *   node scripts/setup-telegram-webhook.mjs --check-only
 *   node scripts/setup-telegram-webhook.mjs --token 123456:ABC --url https://xyz.supabase.co
 */

import process from 'node:process'

// Parse CLI flags
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    supabaseUrl: process.env.SUPABASE_URL || 'https://xhilmsuvjuwoivyseoyz.supabase.co',
    secretToken: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    checkOnly: false,
    deleteWebhook: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--token' && args[i + 1]) {
      options.token = args[++i]
    } else if (arg === '--url' && args[i + 1]) {
      options.supabaseUrl = args[++i]
    } else if (arg === '--secret' && args[i + 1]) {
      options.secretToken = args[++i]
    } else if (arg === '--check-only') {
      options.checkOnly = true
    } else if (arg === '--delete') {
      options.deleteWebhook = true
    }
  }

  return options
}

async function callTelegram(token, method, payload = {}, retries = 3) {
  const url = `https://api.telegram.org/bot${token}/${method}`
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      })
      return await res.json()
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
}

export async function configureTelegramBot(opts) {
  const { token, supabaseUrl, secretToken, checkOnly, deleteWebhook } = opts

  if (!token) {
    throw new Error('Telegram Bot Token is required. Pass --token <token> or set TELEGRAM_BOT_TOKEN.')
  }

  console.log('🤖 Connecting to Telegram Bot API...')
  const me = await callTelegram(token, 'getMe')
  if (!me.ok) {
    throw new Error(`Failed to verify bot token: ${me.description || 'Unknown error'}`)
  }
  console.log(`   ✅ Bot Verified: @${me.result.username} (ID: ${me.result.id}, Name: "${me.result.first_name}")\n`)

  // Check current webhook status
  const currentInfo = await callTelegram(token, 'getWebhookInfo')
  console.log('📡 Current Webhook Status:')
  console.log(`   URL: ${currentInfo.result?.url || '(None configured)'}`)
  console.log(`   Custom Certificate: ${currentInfo.result?.has_custom_certificate ? 'Yes' : 'No'}`)
  console.log(`   Pending Update Count: ${currentInfo.result?.pending_update_count ?? 0}`)
  if (currentInfo.result?.last_error_message) {
    console.log(`   ⚠️ Last Error: ${currentInfo.result.last_error_message}`)
    console.log(`   ⚠️ Last Error Date: ${new Date(currentInfo.result.last_error_date * 1000).toISOString()}`)
  }
  console.log()

  if (checkOnly) {
    console.log('🏁 Check complete (--check-only mode).')
    return { me: me.result, webhookInfo: currentInfo.result }
  }

  // Handle Webhook Deletion
  if (deleteWebhook) {
    console.log('🗑️ Deleting Webhook...')
    const delRes = await callTelegram(token, 'deleteWebhook', { drop_pending_updates: true })
    if (delRes.ok) {
      console.log('   ✅ Webhook successfully deleted.')
    } else {
      console.error(`   ❌ Failed to delete webhook: ${delRes.description}`)
    }
    return { me: me.result, deleted: delRes.ok }
  }

  // 1. Set Official Bot Slash Commands Menu
  console.log('📋 Registering Bot Commands Menu (Arabic)...')
  const commands = [
    { command: 'start', description: 'بدء الاستخدام والقائمة الرئيسية' },
    { command: 'search', description: 'البحث عن المقررات الدراسية' },
    { command: 'my_courses', description: 'إدارة المقررات المشترك بها' },
    { command: 'pause', description: 'إيقاف التنبيهات مؤقتاً' },
    { command: 'resume', description: 'استئناف التنبيهات' },
    { command: 'bind_course', description: 'ربط مجموعة دراسية بإشعارات مساق' },
    { command: 'help', description: 'المساعدة ودليل الاستخدام' },
    { command: 'about', description: 'عن رادار مودل والخصوصية' },
  ]

  const cmdRes = await callTelegram(token, 'setMyCommands', { commands })
  if (cmdRes.ok) {
    console.log('   ✅ Bot commands menu registered successfully.')
  } else {
    console.warn(`   ⚠️ Warning registering commands: ${cmdRes.description}`)
  }

  // 2. Configure Webhook URL
  const webhookUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/telegram-webhook`
  console.log(`\n🔗 Registering Webhook Target:\n   -> ${webhookUrl}`)

  const webhookPayload = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  }

  if (secretToken) {
    webhookPayload.secret_token = secretToken
    console.log('   🔒 Secret token header configured (X-Telegram-Bot-Api-Secret-Token)')
  }

  const setRes = await callTelegram(token, 'setWebhook', webhookPayload)
  if (!setRes.ok) {
    throw new Error(`Failed to set webhook: ${setRes.description}`)
  }
  console.log('   ✅ Webhook registered successfully.')

  // 3. Confirm new webhook info
  const updatedInfo = await callTelegram(token, 'getWebhookInfo')
  console.log('\n📊 Updated Webhook Status:')
  console.log(`   URL: ${updatedInfo.result?.url}`)
  console.log(`   Pending Update Count: ${updatedInfo.result?.pending_update_count ?? 0}`)
  console.log('\n🎉 Telegram Bot Setup Completed Successfully!')

  return {
    bot: me.result,
    webhookInfo: updatedInfo.result,
    commands,
  }
}

// Execute when invoked directly from command line
if (process.argv[1]?.endsWith('setup-telegram-webhook.mjs')) {
  const options = parseArgs()
  if (!options.token && !process.env.TELEGRAM_BOT_TOKEN) {
    console.log('ℹ️ Usage: node scripts/setup-telegram-webhook.mjs --token <BOT_TOKEN> [options]')
    console.log('   Or set TELEGRAM_BOT_TOKEN in your environment.')
    process.exit(0)
  }

  configureTelegramBot(options).catch((err) => {
    console.error(`\n❌ Error: ${err.message}`)
    process.exit(1)
  })
}
