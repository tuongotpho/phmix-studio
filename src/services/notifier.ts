export interface RegistrationInfo {
  email: string;
  displayName: string;
  uid: string;
  status: string;
}

export async function sendTelegramNotification(info: RegistrationInfo, retries = 3) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Notifier] Telegram bot token or chat ID is missing. Skipping telegram notification.');
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const text = `🔔 *Thông báo đăng ký mới* 🔔\n\nHệ thống *pH-mix* vừa ghi nhận một thành viên mới:\n\n📧 *Email:* \`${info.email}\`\n👤 *Họ tên:* ${info.displayName || '_Chưa cung cấp_'}\n🆔 *User ID:* \`${info.uid}\`\n⚙️ *Trạng thái:* _${info.status === 'admin' ? 'Admin' : 'Chờ duyệt (Pending)'}_\n\n👉 Vui lòng kiểm tra và duyệt tài khoản tại trang quản lý!`;

      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Notifier] Telegram API returned non-OK status on attempt ${attempt}:`, response.status, errText);
        if (attempt === retries) throw new Error('Max retries reached');
      } else {
        console.log('[Notifier] Telegram notification sent successfully.');
        return;
      }
    } catch (error) {
      console.error(`[Notifier] Failed to send Telegram notification on attempt ${attempt}:`, error);
      if (attempt === retries) {
        console.error('[Notifier] All retry attempts failed.');
      } else {
        // Wait before retrying (exponential backoff)
        await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }
  }
}

export async function notifyAdminOfNewUser(info: RegistrationInfo) {
  await sendTelegramNotification(info);
}
